import "./index.css";

import { useState, useMemo, useCallback, useEffect, useRef } from "preact/hooks";
import mime from "mime";
import {
  ConversionOptions,
  SelectedFiles,
  type ConversionOption,
  type ConversionOptionsMap,
} from "src/main";
import { Mode, ModeEnum } from "src/ui/ModeStore";
import normalizeMimeType from "src/normalizeMimeType";
import type { FileFormat } from "src/FormatHandler";

import FormatExplorer from "src/ui/components/Conversion/FormatExplorer";
import LoadingScreen from "src/ui/components/LoadingScreen";
import SiteShell from "src/ui/components/SiteShell";
import HowItWorks from "src/ui/components/HowItWorks";
import { ArrowLeft, ArrowRight, Plus } from "lucide-preact";
import { PopupData } from "src/ui";
import { openPopup } from "src/ui/PopupStore";
import FileInfoBadge from "src/ui/components/FileInfo";
import { ConversionInProgress, CurrentPage, Pages } from "src/ui/AppState";
import { ProgressStore } from "src/ui/ProgressStore";
import StyledButton, { ButtonVariant } from "src/ui/components/StyledButton";
import { t } from "src/ui/i18n";

type ConversionStep = "select-from" | "select-to" | "converting";

function countAvailableFormats(
  options: ConversionOptionsMap,
  direction: "from" | "to",
  advancedMode: boolean,
): number {
  const seen = new Set<string>();
  let count = 0;

  for (const [format] of options) {
    if (direction === "from" && !format.from) continue;
    if (direction === "to" && !format.to) continue;

    if (advancedMode) {
      count += 1;
      continue;
    }

    const dedupeKey = `${format.mime}|${format.format}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    count += 1;
  }

  return count;
}

function getConversionOptions(): ConversionOptionsMap {
  if (ConversionOptions.size) return ConversionOptions;
  throw new Error("Can't build format list!", { cause: "UI got empty global format list" });
}

function expandVideoContainerMimes(candidates: string[]): string[] {
  const out = new Set(candidates);
  for (const c of candidates) {
    if (c === "video/mp4" || c === "video/quicktime") {
      out.add("video/mp4");
      out.add("video/quicktime");
    }
  }
  return [...out];
}

function getMimeCandidatesForFile(file: File): string[] {
  const set = new Set<string>();
  const raw = file.type?.trim();
  if (raw) set.add(normalizeMimeType(raw));
  const fromPath = mime.getType(file.name);
  if (fromPath) set.add(normalizeMimeType(fromPath));
  const extOnly = file.name.split(".").pop()?.toLowerCase();
  if (extOnly) {
    const fromExt = mime.getType(extOnly);
    if (fromExt) set.add(normalizeMimeType(fromExt));
  }
  return expandVideoContainerMimes([...set]);
}

function formatMatchesUploadedFile(
  format: FileFormat,
  ext: string,
  mimeCandidates: string[],
): boolean {
  if (mimeCandidates.some((m) => m === format.mime)) return true;
  if (!ext) return false;
  const e = ext.toLowerCase();
  const fex = format.extension.toLowerCase();
  const fmt = format.format.toLowerCase();
  const intr = format.internal.toLowerCase();
  return (
    fex === e || fex.includes(e) || fmt === e || fmt.includes(e) || intr === e || intr.includes(e)
  );
}

function getMatchingFromFormats(
  options: ConversionOptionsMap,
  files: File[],
): ConversionOptionsMap {
  if (files.length === 0) return options;

  const file = files[0];
  const mimeCandidates = getMimeCandidatesForFile(file);
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const matched: ConversionOptionsMap = new Map();

  for (const [format, handler] of options) {
    if (!format.from) continue;
    if (formatMatchesUploadedFile(format, ext, mimeCandidates)) {
      matched.set(format, handler);
    }
  }

  return matched.size > 0 ? matched : options;
}

function downloadFile(bytes: Uint8Array, name: string, type: string) {
  const blob = new Blob([bytes as BlobPart], { type: type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
}

function removeFile(key: string) {
  const { [key as keyof typeof SelectedFiles.value]: _, ...rest } = SelectedFiles.value;
  SelectedFiles.value = rest;
  if (Object.keys(rest).length === 0) CurrentPage.value = Pages.Upload;
}

function addFiles(fileList: FileList | null | undefined) {
  if (!fileList || fileList.length === 0) return;

  const files = [...Object.values(SelectedFiles.value), ...Array.from(fileList)];

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
}

export default function Conversion() {
  const allOptions = getConversionOptions();
  const files = Object.values(SelectedFiles.value);
  const firstFile = files[0];
  const isAdvanced = Mode.value === ModeEnum.Advanced;

  const matchingFrom = useMemo(
    () => getMatchingFromFormats(allOptions, files),
    [allOptions, files],
  );

  const autoSelectOption = useMemo<ConversionOption | null>(() => {
    if (!matchingFrom.size) return null;
    const isSimple = Mode.value === ModeEnum.Simple;
    if (!isSimple) {
      if (matchingFrom.size === 1) return matchingFrom.entries().next().value ?? null;
      else return null;
    }

    const mimeCandidates = getMimeCandidatesForFile(firstFile);
    const ext = firstFile.name.split(".").pop()?.toLowerCase() || "";

    const uniqueFormats = new Set<string>();
    for (const [format, handler] of matchingFrom) {
      uniqueFormats.add(`${format.mime}|${format.format}`);

      // chances are, this format is exactly what the user wants
      if (ext === format.extension && mimeCandidates.includes(format.mime)) {
        return [format, handler];
      }
    }
    if (uniqueFormats.size === 1) return matchingFrom.entries().next().value ?? null;

    return null;
  }, [matchingFrom, Mode.value, firstFile]);

  const [step, setStep] = useState<ConversionStep>(() => {
    if (autoSelectOption) return "select-to";
    return "select-from";
  });

  const [fromOption, setFromOption] = useState<ConversionOption | null>(autoSelectOption);

  const [toOption, setToOption] = useState<ConversionOption | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  useEffect(() => {
    if (!firstFile || isConverting) return;

    if (autoSelectOption) {
      setFromOption(autoSelectOption);
      setStep("select-to");
    } else {
      setFromOption(null);
      setStep("select-from");
    }

    setToOption(null);
  }, [firstFile]);

  const handleFromSelect = useCallback((option: ConversionOption | null) => {
    setFromOption(option);
  }, []);

  const handleToSelect = useCallback((option: ConversionOption | null) => {
    setToOption(option);
  }, []);

  const handleNext = () => {
    if (step === "select-from" && fromOption) {
      setStep("select-to");
    }
  };

  const handleBack = () => {
    if (step === "select-to") {
      setStep("select-from");
    }
  };

  const handleFromToClickFrom = () => {
    setStep("select-from");
  };

  const handleFromToClickTo = () => {
    setStep("select-to");
  };

  const handleConvert = async () => {
    if (!fromOption || !toOption || !firstFile) return;

    setIsConverting(true);
    ConversionInProgress.value = true;
    setStep("converting");
    ProgressStore.reset();
    const abortController = ProgressStore.controller;

    try {
      const inputFileData = [];
      for (const f of files) {
        const buf = await f.arrayBuffer();
        const bytes = new Uint8Array(buf);

        if (
          fromOption[0].mime === toOption[0].mime &&
          fromOption[0].format === toOption[0].format
        ) {
          downloadFile(bytes, f.name, toOption[0].mime);
          continue;
        }
        inputFileData.push({ name: f.name, bytes });
      }

      if (inputFileData.length === 0) {
        setIsConverting(false);
        setStep("select-to");
        return;
      }

      const fromNode = { handler: fromOption[1], format: fromOption[0] };
      const toNode = { handler: toOption[1], format: toOption[0] };

      const output = await window.tryConvertByTraversing(
        inputFileData,
        fromNode,
        toNode,
        abortController.signal,
      );

      if (!output) {
        setIsConverting(false);
        setStep("select-to");
        PopupData.value = {
          title: t("convert.popup.failedTitle"),
          text: t("convert.popup.failedText"),
          dismissible: true,
          buttonText: t("common.ok"),
        };
        openPopup();
        return;
      }

      for (const file of output.files) {
        downloadFile(file.bytes, file.name, toOption[0].mime);
      }

      PopupData.value = {
        title: t("convert.popup.doneTitle"),
        text: t("convert.popup.doneText", {
          from: fromOption[0].format.toUpperCase(),
          to: toOption[0].format.toUpperCase(),
          path: output.path.map((c) => c.format.format).join(" → "),
        }),
        dismissible: true,
        buttonText: t("common.ok"),
      };
      openPopup();
    } catch (e) {
      console.error(e);
      if (e instanceof Error && e.name === "AbortError") {
        // Don't show an error popup for manual cancellation
      } else {
        PopupData.value = {
          title: t("convert.popup.errorTitle"),
          text: t("convert.popup.errorText", { error: String(e) }),
          dismissible: true,
          buttonText: t("common.ok"),
        };
        openPopup();
      }
    } finally {
      setIsConverting(false);
      ConversionInProgress.value = false;
      setStep("select-to");
    }
  };

  const addFileRef = useRef<HTMLInputElement>(null);

  const handleAddClick = (ev: MouseEvent) => {
    ev.preventDefault();
    addFileRef.current?.click();
  };

  const handleAddChange = () => {
    addFiles(addFileRef.current?.files);
  };

  const canProceed = step === "select-from" ? !!fromOption : !!fromOption && !!toOption;

  const converting = step === "converting";
  const fileCount = files.length;

  return (
    <SiteShell>
      <section id="add" className="conversion-files frost card" data-reveal>
        <h2 className="step-title">
          <span className="num">1</span> {t("convert.files.title", { n: fileCount })}
          <span className="step-sub">
            {t("convert.files.selected", { n: fileCount })}
            {firstFile
              ? ` · ${fromOption ? fromOption[0].format.toUpperCase() : t("convert.files.typeUnknown")}`
              : ""}
          </span>
        </h2>
        <div className="conversion-action-files">
          {Object.entries(SelectedFiles.value).map(([key, file]) => (
            <FileInfoBadge
              key={key}
              fileName={file.name}
              fileSize={file.size}
              extension={file.name.split(".").pop()}
              mimeType={file.type}
              onRemove={converting ? undefined : () => removeFile(key)}
            />
          ))}
          {!converting && (
            <div
              className="file-info-badge file-info-add"
              onClick={handleAddClick}
              role="button"
              tabIndex={0}
              aria-label={t("convert.files.add")}
              title={t("convert.files.add")}
            >
              <input
                ref={addFileRef}
                type="file"
                multiple
                hidden
                onClick={(ev) => ev.stopPropagation()}
                onChange={handleAddChange}
              />
              <Plus size={16} />
            </div>
          )}
        </div>
      </section>

      {converting ? (
        <section id="convert" className="conversion-step frost card" data-reveal>
          <h2 className="step-title">
            <span className="num">3</span> {t("convert.converting.title")}
            <span className="step-sub">{t("convert.converting.sub")}</span>
          </h2>
          <LoadingScreen
            fileName={firstFile?.name || "file"}
            fileSize={firstFile?.size}
            from={fromOption?.[0]}
            to={toOption?.[0]}
          />
        </section>
      ) : (
        <section id="choose" className="conversion-step frost card" data-reveal>
          <h2 className="step-title">
            <span className="num">2</span>
            {t(step === "select-from" ? "convert.choose.fromTitle" : "convert.choose.toTitle")}
            <span className="step-sub">
              {t(step === "select-from" ? "convert.choose.fromSub" : "convert.choose.toSub")}
            </span>
          </h2>

          <FormatExplorer
            conversionOptions={step === "select-from" ? matchingFrom : allOptions}
            onSelect={step === "select-from" ? handleFromSelect : handleToSelect}
            direction={step === "select-from" ? "from" : "to"}
            fromOption={fromOption}
            toOption={toOption}
            fromCount={countAvailableFormats(matchingFrom, "from", isAdvanced)}
            toCount={countAvailableFormats(allOptions, "to", isAdvanced)}
            onClickFrom={handleFromToClickFrom}
            onClickTo={handleFromToClickTo}
          />

          <div className="conversion-action-bar">
            {step === "select-to" && (
              <StyledButton onClick={handleBack}>
                <ArrowLeft size={16} />
                {t("convert.choose.back")}
              </StyledButton>
            )}
            <StyledButton
              className="go"
              variant={ButtonVariant.Primary}
              disabled={!canProceed}
              onClick={step === "select-from" ? handleNext : handleConvert}
            >
              {step === "select-from"
                ? t("convert.choose.next")
                : toOption
                  ? t("convert.choose.convertTo", { format: toOption[0].format.toUpperCase() })
                  : t("convert.choose.convert")}
              {step === "select-from" && <ArrowRight size={16} />}
            </StyledButton>
          </div>
        </section>
      )}

      <HowItWorks />
    </SiteShell>
  );
}
