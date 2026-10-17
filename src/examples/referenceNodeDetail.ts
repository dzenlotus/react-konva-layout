/** Application policy: these thresholds are examples, never library defaults. */
export interface ReferenceNodeDetail {
  showPreview: boolean;
  showDescription: boolean;
  showActions: boolean;
}

export function referenceNodeDetail(scale: number): ReferenceNodeDetail {
  return {
    showPreview: scale >= 0.4,
    showDescription: scale >= 0.25,
    showActions: scale >= 0.15,
  };
}
