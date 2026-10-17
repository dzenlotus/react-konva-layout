/** Local reads preserve ancestor shells, but cannot safely reproduce sibling selectors. */
export class CssPolicy {
  private revision = -1;
  private structuralSelectors: string[] = [];
  private identitySelectors: string[] = [];
  private opaque = false;

  refresh(revision: number): void {
    if (this.revision === revision) return;
    this.revision = revision;
    this.structuralSelectors = [];
    this.identitySelectors = [];
    this.opaque = false;
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        this.collect(sheet.cssRules);
      } catch {
        this.opaque = true;
      }
    }
  }

  canMeasureLocally(element: HTMLElement, root: HTMLElement): boolean {
    if (this.opaque) return false;
    const candidates: Element[] = [element, ...element.querySelectorAll('*')];
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== root) {
      candidates.push(ancestor);
      ancestor = ancestor.parentElement;
    }
    for (const selector of this.structuralSelectors) {
      // Conservatively test the final subject, including rules whose siblings are absent.
      const subject =
        selector
          .replace(/:[\w-]+\([^)]*\)/g, '')
          .replace(/:(?:nth(?:-last)?|first|last|only)-[\w-]+/g, '')
          .trim()
          .split(/[\s>+~]+/)
          .at(-1) || '*';
      try {
        if (candidates.some((candidate) => candidate.matches(subject))) return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  needsTemplateIdentity(element: HTMLElement): boolean {
    if (this.opaque) return true;
    try {
      return this.identitySelectors.some((selector) => element.matches(selector));
    } catch {
      return true;
    }
  }

  private collect(rules: CSSRuleList): void {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        const structural = /:(?:nth(?:-last)?|first|last|only)-(?:child|of-type)|[+~]|:has\(/.test(
          rule.selectorText,
        );
        const anchored = ['bottom', 'inset', 'inset-block', 'inset-block-end'].some((name) => {
          const value = rule.style.getPropertyValue(name);
          return value && value !== 'auto';
        });
        if (structural || anchored) this.structuralSelectors.push(...rule.selectorText.split(','));
        if (structural || /#|:empty\b|\[\s*(?:id|data-testid)\b/.test(rule.selectorText)) {
          this.identitySelectors.push(...rule.selectorText.split(','));
        }
        if ('cssRules' in rule)
          this.collect((rule as CSSStyleRule & { cssRules: CSSRuleList }).cssRules);
      } else if (rule instanceof CSSImportRule) {
        try {
          if (rule.styleSheet) this.collect(rule.styleSheet.cssRules);
          else this.opaque = true;
        } catch {
          this.opaque = true;
        }
      } else if ('cssRules' in rule) {
        this.collect((rule as CSSGroupingRule).cssRules);
      }
    }
  }
}
