import { describe, expect, it } from "vitest";
import { getTopmostWatermarkLayerAtPoint } from "./PreviewPane";

const makeLayer = ({
  id,
  zIndex,
  rotation = 0,
  width = 100,
  height = 100,
  visible = true
}: {
  id: string;
  zIndex: number;
  rotation?: number;
  width?: number;
  height?: number;
  visible?: boolean;
}) => ({
  id,
  name: `${id}.png`,
  previewUrl: `blob:${id}`,
  overlayStyle: {
    left: "0px",
    top: "0px",
    width: "100px",
    height: "100px"
  },
  overlayImageStyle: {},
  rasterStyle: {},
  isActive: false,
  zIndex,
  hitTestBox: {
    width,
    height,
    rotation
  },
  visible,
  locked: false
});

describe("getTopmostWatermarkLayerAtPoint", () => {
  it("skips a higher layer when the point is only inside its rotated bounding box", () => {
    const topLayer = makeLayer({
      id: "top",
      zIndex: 2,
      rotation: 45,
      width: 100,
      height: 40
    });
    const bottomLayer = makeLayer({
      id: "bottom",
      zIndex: 1
    });

    expect(getTopmostWatermarkLayerAtPoint([bottomLayer, topLayer], 10, 10)?.id).toBe("bottom");
  });

  it("selects the highest visible layer that actually contains the point", () => {
    const topLayer = makeLayer({
      id: "top",
      zIndex: 2,
      rotation: 45,
      width: 100,
      height: 40
    });
    const bottomLayer = makeLayer({
      id: "bottom",
      zIndex: 1
    });

    expect(getTopmostWatermarkLayerAtPoint([bottomLayer, topLayer], 50, 50)?.id).toBe("top");
  });
});
