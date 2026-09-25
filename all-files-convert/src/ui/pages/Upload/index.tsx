import { useEffect, useRef } from "preact/hooks";
import { CurrentPage, LoadingToolsText, Pages } from "src/ui/AppState";
import { SelectedFiles } from "src/main";
import { Loader2, Upload } from "lucide-preact";
import { PopupData } from "src/ui";
import { openPopup } from "src/ui/PopupStore";

import SiteShell from "src/ui/components/SiteShell";
import HowItWorks from "src/ui/components/HowItWorks";

import "./index.css";
import { t } from "src/ui/i18n";

export default function UploadPage() {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleClick = (ev: MouseEvent) => {
    ev.preventDefault();
    if (!formatsReady) return;
    fileRef.current?.click();
  };

  const formatsReady = LoadingToolsText.value === undefined;

  const processFiles = (fileList: FileList | null | undefined) => {
    if (!fileList || fileList.length === 0) return;
    if (!formatsReady) return;

    const files = Array.from(fileList);

    const sameMime = files.every((file) => file.type === files[0].type);
    if (!sameMime) {
      PopupData.value = {
        title: t("convert.popup.invalidTitle"),
        text: t("convert.popup.invalidText"),
        dismissible: true,
        buttonText: t("common.ok"),
      };
      openPopup();
      return;
    }

    SelectedFiles.value = Object.fromEntries(
      files.map((file) => [`${file.name}-${file.lastModified}`, file]),
    );
    CurrentPage.value = Pages.Conversion;
  };

  const handleChange = () => {
    processFiles(fileRef.current?.files);
  };

  const handlePaste = (event: ClipboardEvent) => {
    processFiles(event.clipboardData?.files);
  };

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [formatsReady]);

  const touch = window.matchMedia("(pointer: coarse)").matches;

  return (
    <SiteShell>
      <section id="add" className="upload-section frost card" data-reveal>
        <h2 className="step-title">
          <span className="num">1</span> {t("convert.upload.title")}
          <span className="step-sub">{t("convert.upload.private")}</span>
        </h2>

        <div
          className={`upload-dropzone ${!formatsReady ? "upload-dropzone--pending" : ""}`}
          onClick={handleClick}
          role="button"
          tabIndex={0}
          aria-disabled={!formatsReady}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!formatsReady) return;
              fileRef.current?.click();
            }
          }}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            name="uploadFile"
            id="uploadFile"
            onClick={(ev) => ev.stopPropagation()}
            tabIndex={0}
            disabled={!formatsReady}
            onChange={handleChange}
          />
          <div className="upload-icon-wrap">
            {formatsReady ? <Upload /> : <Loader2 className="upload-spin" />}
          </div>
          {formatsReady ? (
            <>
              <strong className="upload-cta">{t(touch ? "convert.upload.tap" : "convert.upload.click")}</strong>
              <span className="upload-hint">
                {t(touch ? "convert.upload.hintTouch" : "convert.upload.hint")}
              </span>
            </>
          ) : (
            <>
              <strong className="upload-cta">{t("convert.upload.loading")}</strong>
              <span className="upload-hint">{t(LoadingToolsText.value ?? "")}</span>
            </>
          )}
        </div>

        <p className="upload-note">
          {t("convert.upload.note")}
        </p>
      </section>

      <HowItWorks />
    </SiteShell>
  );
}
