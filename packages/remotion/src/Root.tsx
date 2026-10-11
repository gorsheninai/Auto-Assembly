import React from "react";
import { Composition } from "remotion";
import { FPS, HEIGHT, WIDTH } from "@aa/schema";
import { Video, VideoProps } from "./Video";
import { InsertBench, InsertBenchProps } from "./InsertBench";

export const Root: React.FC = () => (
  <>
  <Composition id="InsertBench" component={InsertBench} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={FPS}
    defaultProps={{} as InsertBenchProps} calculateMetadata={({ props }) => ({ durationInFrames: (props as any).frames ?? FPS })} />
  <Composition
    id="Main" component={Video} width={WIDTH} height={HEIGHT} fps={FPS} durationInFrames={FPS}
    defaultProps={{} as VideoProps}
    calculateMetadata={({ props }) => ({ durationInFrames: props.plan.totalFrames, fps: props.plan.fps })}
  />
  </>
);
