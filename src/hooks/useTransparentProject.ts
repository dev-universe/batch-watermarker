import { useCallback, useRef, useState } from "react";
import type { TransparentProject } from "../shared/transparentImageTypes";

const emptyProject = (): TransparentProject => ({ groups: [{ id: crypto.randomUUID(), name: "그룹 1", pages: [] }], background: null, watermarks: [] });

export function useTransparentProject() {
  const [project, setProject] = useState(emptyProject);
  const current = useRef(project);
  const past = useRef<TransparentProject[]>([]);
  const future = useRef<TransparentProject[]>([]);
  const continuous = useRef<TransparentProject | null>(null);
  const [, refreshHistory] = useState(0);
  const commit = useCallback((update: (value: TransparentProject) => TransparentProject) => {
    const previous = current.current;
    const next = update(previous);
    if (next === previous) return;
    if (!continuous.current) {
      past.current.push(previous);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
    }
    current.current = next;
    setProject(next);
  }, []);
  const begin = useCallback(() => { continuous.current ??= current.current; }, []);
  const end = useCallback(() => {
    if (continuous.current && continuous.current !== current.current) {
      past.current.push(continuous.current);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      refreshHistory(value => value + 1);
    }
    continuous.current = null;
  }, []);
  const undo = useCallback(() => {
    end();
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(current.current);
    current.current = previous;
    setProject(previous);
  }, [end]);
  const redo = useCallback(() => {
    end();
    const next = future.current.pop();
    if (!next) return;
    past.current.push(current.current);
    current.current = next;
    setProject(next);
  }, [end]);
  return { project, current, commit, begin, end, undo, redo, canUndo: !!past.current.length || !!continuous.current, canRedo: !!future.current.length };
}
