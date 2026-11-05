import type { DragEvent } from "react";
import type { ImageGroup, TransparentProject } from "../shared/transparentImageTypes";
import { moveItem, movePageToGroup } from "../shared/transparentImageState";

interface Props {
  project: TransparentProject;
  group?: ImageGroup;
  pageId?: string;
  selectGroup: (id: string) => void;
  selectPage: (id: string) => void;
  addGroup: () => void;
  commit: (update: (project: TransparentProject) => TransparentProject) => void;
  updateGroup: (id: string, update: (group: ImageGroup) => ImageGroup) => void;
  addFiles: () => void;
  dropFiles: (event: DragEvent<HTMLElement>) => void;
}

export function ImageGroupsPanel({ project, group, pageId, selectGroup, selectPage, addGroup, commit, updateGroup, addFiles, dropFiles }: Props) {
  return <section className="panel ti-groups-panel">
    <div className="panel-head"><h2>그룹과 페이지</h2><button onClick={addGroup}>그룹 추가</button></div>
    <p className="subtle">그룹 하나가 PDF 파일 하나가 됩니다.</p>
    <div className="ti-group-list">{project.groups.map(item => <div className={`ti-group-row ${group?.id === item.id ? "active" : ""}`} key={item.id}>
      <button className="ti-group-select" aria-label={`${item.name} 선택`} aria-pressed={group?.id === item.id} onClick={() => selectGroup(item.id)}>{item.pages.length}<small>페이지</small></button>
      <input aria-label="그룹 이름" value={item.name} onFocus={() => selectGroup(item.id)} onChange={event => updateGroup(item.id, value => ({ ...value, name: event.target.value }))} />
      <button className="ti-delete" aria-label={`${item.name} 삭제`} onClick={() => commit(value => ({ ...value, groups: value.groups.filter(candidate => candidate.id !== item.id) }))}>×</button>
    </div>)}</div>
    {group ? <>
      <div className="dropzone compact ti-file-drop" onDragOver={event => event.preventDefault()} onDrop={dropFiles}>
        <button onClick={addFiles}>입력 이미지 추가</button><span>SVG · PNG · JPG · WebP · TIFF<br />이 그룹에 파일을 드래그하세요.</span>
      </div>
      <ol className="ti-pages">{group.pages.map((page, index) => <li key={page.id} className={page.id === pageId ? "active" : ""}>
        <button className="ti-page-select" title={page.asset.path} onClick={() => selectPage(page.id)}><span>{index + 1}</span><strong>{page.asset.name}</strong></button>
        <div className="ti-page-actions">
          <button aria-label={`${page.asset.name} 위로`} disabled={index === 0} onClick={() => updateGroup(group.id, item => ({ ...item, pages: moveItem(item.pages, index, -1) }))}>↑</button>
          <button aria-label={`${page.asset.name} 아래로`} disabled={index === group.pages.length - 1} onClick={() => updateGroup(group.id, item => ({ ...item, pages: moveItem(item.pages, index, 1) }))}>↓</button>
          {project.groups.length > 1 && <select aria-label={`${page.asset.name} 그룹 이동`} value="" onChange={event => commit(value => movePageToGroup(value, group.id, event.target.value, page.id))}>
            <option value="">그룹 이동</option>{project.groups.filter(item => item.id !== group.id).map(item => <option key={item.id} value={item.id}>{item.name || "이름 없는 그룹"}</option>)}
          </select>}
          <button className="ti-delete" aria-label={`${page.asset.name} 삭제`} onClick={() => updateGroup(group.id, item => ({ ...item, pages: item.pages.filter(value => value.id !== page.id) }))}>삭제</button>
        </div>
      </li>)}</ol>
      {!group.pages.length && <p className="panel-empty">입력 SVG 한 장이 PDF 한 페이지가 됩니다.</p>}
    </> : <p className="panel-empty">그룹을 추가해 시작하세요.</p>}
  </section>;
}
