import { useState } from "react";
import { Icon } from "./components/Icon";
import { version } from "../package.json";
import WatermarkEditor from "./WatermarkEditor";
import { TransparentImageEditor } from "./components/TransparentImageEditor";

export default function App() {
  const [tab, setTab] = useState<"watermark" | "transparent">("watermark");
  return <div className="app-workspace">
    <header className="workspace-header">
      <div className="app-brand"><Icon name="layers" /><h1>Batch Watermarker</h1><span className="app-version">v{version}</span></div>
      <nav className="workspace-tabs" role="tablist" aria-label="편집 도구">
        <button id="watermark-tab" role="tab" aria-selected={tab === "watermark"} aria-controls="watermark-workspace" onClick={() => setTab("watermark")}>워터마크 편집</button>
        <button id="transparent-tab" role="tab" aria-selected={tab === "transparent"} aria-controls="transparent-workspace" onClick={() => setTab("transparent")}>투명 이미지 편집</button>
      </nav>
    </header>
    <section id="watermark-workspace" role="tabpanel" aria-labelledby="watermark-tab" hidden={tab !== "watermark"} inert={tab !== "watermark"}>
      <WatermarkEditor active={tab === "watermark"} />
    </section>
    <section id="transparent-workspace" role="tabpanel" aria-labelledby="transparent-tab" hidden={tab !== "transparent"} inert={tab !== "transparent"}>
      <TransparentImageEditor active={tab === "transparent"} />
    </section>
  </div>;
}
