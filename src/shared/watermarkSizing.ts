// Sizing helpers convert between source image dimensions, canvas-relative ratios,
// and explicit width/height edits. They do not decide placement or rotation.

export const getCanvasLongestEdge = (canvasWidth: number, canvasHeight: number) =>
  Math.max(canvasWidth, canvasHeight);

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

export const getLongestEdgeRatio = (
  longestEdgePx: number,
  canvasWidth: number,
  canvasHeight: number
) => {
  const canvasLongestEdge = getCanvasLongestEdge(canvasWidth, canvasHeight);
  if (longestEdgePx <= 0 || canvasLongestEdge <= 0) {
    return 0;
  }

  return longestEdgePx / canvasLongestEdge;
};

export const getLongestEdgePxFromRatio = (
  longestEdgeRatio: number,
  canvasWidth: number,
  canvasHeight: number
) => {
  const canvasLongestEdge = getCanvasLongestEdge(canvasWidth, canvasHeight);
  if (longestEdgeRatio <= 0 || canvasLongestEdge <= 0) {
    return 0;
  }

  return longestEdgeRatio * canvasLongestEdge;
};

export const getSizeFromLongestEdgeRatio = (
  sourceWidth: number,
  sourceHeight: number,
  longestEdgeRatio: number,
  canvasWidth: number,
  canvasHeight: number
) =>
  getSizeFromLongestEdge(
    sourceWidth,
    sourceHeight,
    getLongestEdgePxFromRatio(longestEdgeRatio, canvasWidth, canvasHeight)
  );

export const resizeFromWidthPreservingAspectRatio = (
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number
) => {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0) {
    return {
      width: 0,
      height: 0,
      sizePx: 0
    };
  }

  const ratio = targetWidth / sourceWidth;
  const width = targetWidth;
  const height = sourceHeight * ratio;

  return {
    width,
    height,
    sizePx: getLongestEdge(width, height)
  };
};

export const resizeFromHeightPreservingAspectRatio = (
  sourceWidth: number,
  sourceHeight: number,
  targetHeight: number
) => {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetHeight <= 0) {
    return {
      width: 0,
      height: 0,
      sizePx: 0
    };
  }

  const ratio = targetHeight / sourceHeight;
  const width = sourceWidth * ratio;
  const height = targetHeight;

  return {
    width,
    height,
    sizePx: getLongestEdge(width, height)
  };
};

export const resizeBoxFromWidth = (
  currentWidth: number,
  currentHeight: number,
  targetWidth: number,
  preserveAspectRatio: boolean
) => {
  if (currentWidth <= 0 || currentHeight <= 0 || targetWidth <= 0) {
    return {
      width: 0,
      height: 0
    };
  }

  if (!preserveAspectRatio) {
    return {
      width: targetWidth,
      height: currentHeight
    };
  }

  const aspectRatio = currentWidth / currentHeight;
  return {
    width: targetWidth,
    height: targetWidth / aspectRatio
  };
};

export const resizeBoxFromHeight = (
  currentWidth: number,
  currentHeight: number,
  targetHeight: number,
  preserveAspectRatio: boolean
) => {
  if (currentWidth <= 0 || currentHeight <= 0 || targetHeight <= 0) {
    return {
      width: 0,
      height: 0
    };
  }

  if (!preserveAspectRatio) {
    return {
      width: currentWidth,
      height: targetHeight
    };
  }

  const aspectRatio = currentWidth / currentHeight;
  return {
    width: targetHeight * aspectRatio,
    height: targetHeight
  };
};
