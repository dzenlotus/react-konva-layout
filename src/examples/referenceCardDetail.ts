/** Application policy: these thresholds are examples, never library defaults. */
export interface ReferenceCardDetail {
  showPreview: boolean;
  showDescription: boolean;
  showActions: boolean;
}

export function referenceCardDetail(scale: number): ReferenceCardDetail {
  return {
    showPreview: scale >= 0.4,
    showDescription: scale >= 0.25,
    showActions: scale >= 0.15,
  };
}
