import { signal } from "@preact/signals";

import type { PopupDataContainer } from "./PopupStore";

export const enum Pages {
  Upload = "uploadPage",
  Conversion = "conversionPage",
}

export const CurrentPage = signal<Pages>(Pages.Upload);

export const PopupData = signal<PopupDataContainer>({
  title: "Loading tools...",
  text: "Please wait while the app loads conversion tools.",
  dismissible: false,
  buttonText: "Ignore",
});

/** Translation key of the "formats are loading" hint; undefined once all tools are ready. */
export const LoadingToolsText = signal<string | undefined>("convert.upload.loadingHint");
export const ConversionInProgress = signal(false);
