import { PopupData } from "src/ui";
import { popupOpen } from "src/ui/PopupStore";
import { t } from "src/ui/i18n";

/** Opens the "Help & Info" popup (also used by the site header). */
export function showHelp() {
  PopupData.value = {
    dismissible: true,
    buttonText: t("convert.popup.gotIt"),
  };
  PopupData.value.contents = (
    <div className="help-content">
      <h1>All Files Convert!</h1>
      <p className="help-subtitle">{t("convert.helpPopup.subtitle")}</p>

      <div className="help-section">
        <h2>{t("convert.helpPopup.whyTitle")}</h2>
        <p dangerouslySetInnerHTML={{ __html: t("convert.helpPopup.why1") }} />
        <p dangerouslySetInnerHTML={{ __html: t("convert.helpPopup.why2") }} />
        <p>
          {/* <a href="https://youtu.be/btUbcsTbVA8" target="_blank" style="color: var(--primary)">
            Click here for a more in-depth video.
          </a> */}
        </p>
      </div>

      <div className="help-section">
        <h2>{t("convert.helpPopup.howTitle")}</h2>
        <ol>
            <li>{t("convert.helpPopup.how1")}</li>
            <li>{t("convert.helpPopup.how2")}</li>
            <li>{t("convert.helpPopup.how3")}</li>
            <li dangerouslySetInnerHTML={{ __html: t("convert.helpPopup.how4") }} />
          </ol>
      </div>

      <div className="help-section">
        <h2>{t("convert.helpPopup.advancedTitle")}</h2>
        <p>{t("convert.helpPopup.advancedText")}</p>
      </div>
    </div>
  );
  popupOpen.value = true;
}
