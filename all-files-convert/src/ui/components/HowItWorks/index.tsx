import { Download, FileUp, Shuffle } from "lucide-preact";

import "./index.css";
import { t } from "src/ui/i18n";

const STEPS = [
  {
    icon: <FileUp size={22} />,
    tone: "primary",
    key: "add",
  },
  {
    icon: <Shuffle size={22} />,
    tone: "secondary",
    key: "pick",
  },
  {
    icon: <Download size={22} />,
    tone: "accent",
    key: "download",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="how" data-reveal>
      <h2>{t("convert.how.title")}</h2>
      <div className="how-grid">
        {STEPS.map((s) => (
          <div key={s.key} className="how-card frost card">
            <div className={`how-icon tone-${s.tone}`}>{s.icon}</div>
            <h3>{t(`convert.how.${s.key}Title`)}</h3>
            <p>{t(`convert.how.${s.key}Text`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
