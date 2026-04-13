export const getSizeFromLongestEdge = (
  sourceWidth: number,
  sourceHeight: number,
  longestEdgePx: number
) => {
  if (sourceWidth <= 0 || sourceHeight <= 0 || longestEdgePx <= 0) {
    return { width: 0, height: 0 };
  }

  if (sourceWidth >= sourceHeight) {
    const ratio = longestEdgePx / sourceWidth;
    return {
      width: longestEdgePx,
      height: sourceHeight * ratio
    };
  }

  const ratio = longestEdgePx / sourceHeight;
  return {
    width: sourceWidth * ratio,
    height: longestEdgePx
  };
};

export const getLongestEdge = (width: number, height: number) => Math.max(width, height);
