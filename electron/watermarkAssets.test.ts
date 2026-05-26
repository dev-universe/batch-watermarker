import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { getOrCreateWatermarkAsset, type WatermarkAssetCache } from "./watermarkAssets";

const makeWatermarkBuffer = async (color: string) =>
  sharp({
    create: {
      width: 12,
      height: 12,
      channels: 4,
      background: color
    }
  })
    .png()
    .toBuffer();

describe("getOrCreateWatermarkAsset", () => {
  it("keeps watermark assets isolated per source key", async () => {
    const cache: WatermarkAssetCache = new Map();
    const settings = {
      placementMode: "preset" as const,
      freeWidthRatio: null,
      freeHeightRatio: null,
      sizeRatio: 1
    };
    const watermarkBufferA = await makeWatermarkBuffer("rgba(255, 0, 0, 1)");
    const watermarkBufferB = await makeWatermarkBuffer("rgba(0, 0, 255, 1)");

    const assetA = await getOrCreateWatermarkAsset(
      cache,
      watermarkBufferA,
      "/tmp/layer-a.png",
      200,
      200,
      12,
      12,
      settings,
      0
    );
    const assetB = await getOrCreateWatermarkAsset(
      cache,
      watermarkBufferB,
      "/tmp/layer-b.png",
      200,
      200,
      12,
      12,
      settings,
      0
    );

    expect(assetA.rotatedWatermarkBuffer.equals(assetB.rotatedWatermarkBuffer)).toBe(false);
  });
});
