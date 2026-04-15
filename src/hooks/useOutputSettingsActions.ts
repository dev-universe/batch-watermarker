import type { ChangeEvent } from "react";
import type { EditableStateSnapshot } from "../shared/history";

interface UseOutputSettingsActionsOptions {
  commitSnapshot: (updater: (current: EditableStateSnapshot) => EditableStateSnapshot) => void;
}

export function useOutputSettingsActions({ commitSnapshot }: UseOutputSettingsActionsOptions) {
  const openOutputFolderPicker = async () => {
    const folder = await window.watermarkApi.pickOutputFolder();
    if (folder) {
      commitSnapshot((current) => ({
        ...current,
        settings: {
          ...current.settings,
          outputDirectory: folder,
          overwriteOriginal: false
        }
      }));
    }
  };

  const clearOutputDirectory = () => {
    commitSnapshot((current) => ({
      ...current,
      settings: {
        ...current.settings,
        outputDirectory: ""
      }
    }));
  };

  const onOutputDirectoryChange = (event: ChangeEvent<HTMLInputElement>) => {
    commitSnapshot((current) => ({
      ...current,
      settings: {
        ...current.settings,
        outputDirectory: event.target.value,
        overwriteOriginal: false
      }
    }));
  };

  const onSuffixChange = (event: ChangeEvent<HTMLInputElement>) => {
    commitSnapshot((current) => ({
      ...current,
      settings: {
        ...current.settings,
        suffix: event.target.value
      }
    }));
  };

  return {
    openOutputFolderPicker,
    clearOutputDirectory,
    onOutputDirectoryChange,
    onSuffixChange
  };
}
