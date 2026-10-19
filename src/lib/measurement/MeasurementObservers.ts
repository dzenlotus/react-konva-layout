import type { Registration } from '../model';

interface ObserverCallbacks {
  schedule(id?: string): void;
  cssChanged(fontsChanged?: boolean): void;
}

/** Browser signals are translated to dirtiness; observers never perform layout reads. */
export class MeasurementObservers {
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private stylesheetObserver: MutationObserver | null = null;
  private sizes = new WeakMap<Element, { width: number; height: number }>();
  private observing = false;
  private active = false;
  private debug = false;
  private lifetime = 0;

  constructor(
    private readonly root: HTMLDivElement,
    private readonly registrations: Map<string, Registration>,
    private readonly callbacks: ObserverCallbacks,
  ) {}

  start(host: HTMLElement, debug: boolean): void {
    this.stop();
    this.active = true;
    this.debug = debug;
    this.resizeObserver = new ResizeObserver((entries) => {
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
    this.resizeObserver.observe(host);
    this.resizeObserver.observe(this.root);
    this.setDebug(debug);
    this.mutationObserver = new MutationObserver((records) => this.changed(records));
    this.resume();
    this.stylesheetObserver = new MutationObserver(() => this.callbacks.cssChanged());
    this.stylesheetObserver.observe(document.head, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    const fontsWereLoading = document.fonts.status === 'loading';
    const lifetime = this.lifetime;
    void document.fonts.ready.then(() => {
      if (this.active && this.lifetime === lifetime && fontsWereLoading) this.fontsChanged();
    });
    document.fonts.addEventListener('loadingdone', this.fontsChanged);
    window.addEventListener('resize', this.globalCssChanged);
    document.addEventListener('load', this.stylesheetLoaded, true);
  }

  stop(): void {
    this.active = false;
    this.lifetime += 1;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.pause();
    this.mutationObserver = null;
    this.stylesheetObserver?.disconnect();
    this.stylesheetObserver = null;
    document.fonts.removeEventListener('loadingdone', this.fontsChanged);
    window.removeEventListener('resize', this.globalCssChanged);
    document.removeEventListener('load', this.stylesheetLoaded, true);
  }

  setDebug(debug: boolean): void {
    this.debug = debug;
    for (const record of this.registrations.values()) {
      if (!record.props.layoutRoot) continue;
      this.observe(record);
    }
  }

  observe(record: Registration): void {
    if (this.debug && record.props.layoutRoot) this.resizeObserver?.observe(record.element);
    else this.resizeObserver?.unobserve(record.element);
  }

  remove(record: Registration): void {
    this.resizeObserver?.unobserve(record.element);
  }

  pause = (): void => {
    this.mutationObserver?.disconnect();
    this.observing = false;
  };

  resume = (): void => {
    if (!this.active || !this.mutationObserver) return;
    this.mutationObserver.observe(this.root, {
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
    let cssChanged = false;
    for (const mutation of records) {
      if (mutation.target === this.root && mutation.type === 'attributes') continue;
      const element =
        mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
      const primitive = element?.closest<HTMLElement>('[data-layout-key]');
      const key = primitive?.dataset.layoutKey;
      const record = key ? this.registrations.get(key) : undefined;
      // React's layout effect has already registered these inline styles and scheduled
      // their geometry change. External mutations still invalidate the CSS cascade.
      if (
        mutation.type === 'attributes' &&
        mutation.attributeName === 'style' &&
        record?.element === element &&
        record.domStyle === element?.getAttribute('style')
      )
        continue;
      if (mutation.type === 'attributes' || element?.closest('style')) cssChanged = true;
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
    if (cssChanged) this.callbacks.cssChanged();
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
