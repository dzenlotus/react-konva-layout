import type { Registration } from '../model';

interface ObserverCallbacks {
  schedule(id?: string): void;
  cssChanged(fontsChanged?: boolean): void;
}

/** Browser signals are translated to dirtiness; observers never perform layout reads. */
export class MeasurementObservers {
  private resize: ResizeObserver | null = null;
  private mutations: MutationObserver | null = null;
  private styles: MutationObserver | null = null;
  private sizes = new WeakMap<Element, { width: number; height: number }>();
  private observing = false;
  private active = false;
  private debug = false;

  constructor(
    private readonly root: HTMLDivElement,
    private readonly registrations: Map<string, Registration>,
    private readonly callbacks: ObserverCallbacks,
  ) {}

  start(host: HTMLElement, debug: boolean): void {
    this.stop();
    this.active = true;
    this.debug = debug;
    this.resize = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (!entry.target.isConnected || (!entry.contentRect.width && !entry.contentRect.height))
          continue;
        const previous = this.sizes.get(entry.target);
        const next = { width: entry.contentRect.width, height: entry.contentRect.height };
        this.sizes.set(entry.target, next);
        if (!previous || (previous.width === next.width && previous.height === next.height))
          continue;
        if (entry.target === host) this.callbacks.schedule();
        else if (this.debug)
          this.callbacks.schedule((entry.target as HTMLElement).dataset.layoutKey);
      }
    });
    this.resize.observe(host);
    this.resize.observe(this.root);
    this.setDebug(debug);
    this.mutations = new MutationObserver((records) => this.changed(records));
    this.resume();
    this.styles = new MutationObserver(() => this.callbacks.cssChanged());
    this.styles.observe(document.head, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    const fontsWereLoading = document.fonts.status === 'loading';
    void document.fonts.ready.then(() => {
      if (this.active && fontsWereLoading) this.fontsChanged();
    });
    document.fonts.addEventListener('loadingdone', this.fontsChanged);
    window.addEventListener('resize', this.globalCssChanged);
    document.addEventListener('load', this.stylesheetLoaded, true);
  }

  stop(): void {
    this.active = false;
    this.resize?.disconnect();
    this.resize = null;
    this.pause();
    this.mutations = null;
    this.styles?.disconnect();
    this.styles = null;
    document.fonts.removeEventListener('loadingdone', this.fontsChanged);
    window.removeEventListener('resize', this.globalCssChanged);
    document.removeEventListener('load', this.stylesheetLoaded, true);
  }

  setDebug(debug: boolean): void {
    this.debug = debug;
    for (const record of this.registrations.values()) {
      if (!record.props.layoutRoot) continue;
      if (debug) this.resize?.observe(record.element);
      else this.resize?.unobserve(record.element);
    }
  }

  observe(record: Registration): void {
    if (this.debug && record.props.layoutRoot) this.resize?.observe(record.element);
  }

  remove(record: Registration): void {
    this.resize?.unobserve(record.element);
  }

  pause = (): void => {
    this.mutations?.disconnect();
    this.observing = false;
  };

  resume = (): void => {
    if (!this.active || !this.mutations) return;
    this.mutations.observe(this.root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'id', 'data-testid'],
    });
    this.observing = true;
  };

  private changed(records: MutationRecord[]): void {
    if (!this.observing) return;
    if (
      records.some(
        (record) =>
          (record.type === 'attributes' && record.target !== this.root) ||
          (record.target instanceof Element ? record.target : record.target.parentElement)?.closest(
            'style',
          ),
      )
    ) {
      this.callbacks.cssChanged();
    }
    for (const mutation of records) {
      if (mutation.target === this.root && mutation.type === 'attributes') continue;
      const element =
        mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      const primitive = element?.closest<HTMLElement>('[data-layout-key]');
      const key = primitive?.dataset.layoutKey;
      const record = key ? this.registrations.get(key) : undefined;
      if (record) {
        record.domFingerprint = undefined;
        if (
          mutation.type === 'attributes' &&
          element === primitive &&
          (mutation.attributeName === 'class' || record.domStyle !== element?.getAttribute('style'))
        ) {
          record.templateUnsafe = true;
        }
      }
      this.callbacks.schedule(key);
    }
  }

  private fontsChanged = (): void => {
    this.callbacks.cssChanged(true);
  };
  private globalCssChanged = (): void => {
    this.callbacks.cssChanged();
  };
  private stylesheetLoaded = (event: Event): void => {
    if (event.target instanceof HTMLLinkElement && event.target.rel === 'stylesheet')
      this.callbacks.cssChanged();
  };
}
