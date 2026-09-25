import { signal } from "@preact/signals";
import { Fragment } from "preact";
import { Globe, HelpCircle, Moon, Sun, Wrench } from "lucide-preact";

import { goToUploadHome } from "src/main";
import { ConversionInProgress } from "src/ui/AppState";
import { theme, toggleTheme } from "src/ui/ThemeStore";
import { Mode, ModeEnum, toggleMode } from "src/ui/ModeStore";
import { showHelp } from "src/ui/components/HelpButton";
import { langShort, nextLangName, switchLang, t } from "src/ui/i18n";
import {
  afcLogo,
  branchHas,
  COMING_SOON,
  CREDITS,
  HUB,
  isActive,
  MENU_ICONS,
  MENU_LINKS,
  shownTools,
  sideMenu,
  TOOL_GROUPS,
  type MenuBranch,
  type Tool,
} from "../../../../../shared/sgoi.ts";
import { hoverDropdowns } from "../../../../../shared/sideHover.ts";

import "./index.css";

/**
 * SGOI Tools page chrome, the same as on the "Youtube Playlist → MP3" page
 * (../src/pages/index.astro): animated background, sticky header, collapsible
 * side menu listing every tool (from ../shared/sgoi.ts) and footer.
 */

interface SiteShellProps {
  children: preact.ComponentChildren;
}

// This app is served at <site root>/all-files-convert/, the other SGOI tools next to it.
const SITE_ROOT = import.meta.env.BASE_URL.replace(/all-files-convert\/$/, "");
const THIS_TOOL = "convert";

const desktop = matchMedia("(min-width: 1024px)");

// Like the other site: the menu is always shown on desktop, and the "<" / ">"
// tab opens and closes it on phones.
const sideOpen = signal(desktop.matches);
desktop.addEventListener("change", () => (sideOpen.value = desktop.matches));
// Side-menu dropdowns open on hover (same as the other pages).
hoverDropdowns();

sideOpen.subscribe((open) => {
  document.documentElement.dataset.side = open ? "open" : "closed";
});

function toggleSide() {
  if (!desktop.matches) sideOpen.value = !sideOpen.value;
}

/** The menu entry for this tool: don't reload (that would drop loaded files), just close on phones. */
function stayHere(e: MouseEvent) {
  e.preventDefault();
  if (!desktop.matches) sideOpen.value = false;
}

/** "SGOI" with each letter in its own element, so they can jump one after another. */
function SgoiLetters() {
  return (
    <>
      {[...HUB.short].map((c, i) => (
        <i key={i} style={{ "--i": i }}>
          {c}
        </i>
      ))}
    </>
  );
}

// Pairs shown one after another in the little chip under the title.
const FLIP_PAIRS: Array<[string, string]> = [
  ["PNG", "PDF"],
  ["MP4", "GIF"],
  ["DOCX", "MD"],
  ["WAV", "MP3"],
  ["SVG", "PNG"],
];

/** Animated ".PNG → .PDF" chip that flips through example conversions. */
function ExtFlip() {
  const column = (i: 0 | 1) => (
    <span className="ext-flip-window">
      <span className="ext-flip-track" style={{ "--n": FLIP_PAIRS.length }}>
        {[...FLIP_PAIRS, FLIP_PAIRS[0]].map((pair, k) => (
          <i key={k}>.{pair[i]}</i>
        ))}
      </span>
    </span>
  );
  return (
    <span className="ext-flip" aria-hidden="true">
      {column(0)}
      <span className="ext-flip-arrow">→</span>
      {column(1)}
    </span>
  );
}

/** All Files Convert logo (file + swap arrows), shared with the menu and home page. */
function AfcLogo() {
  return <span className="afc-logo-wrap" dangerouslySetInnerHTML={{ __html: afcLogo(36, "afc-grad-header") }} />;
}

function Header() {
  const isAdvanced = Mode.value === ModeEnum.Advanced;
  const busy = ConversionInProgress.value;

  return (
    <header className="site-header">
      <div className="site-header-bar">
        <div className="site-header-inner">
          {/* room for the hamburger (it floats above the menu, see SiteShell below) */}
          <span className="hamburger-space" aria-hidden="true" />
          <a
            href={import.meta.env.BASE_URL}
            className="brand"
            aria-disabled={busy}
            title={t("convert.home")}
            onClick={(ev) => {
              ev.preventDefault();
              if (busy) return;
              goToUploadHome();
              window.scrollTo({ top: 0 });
            }}
          >
            <AfcLogo />
            <span className="brand-text">
              <span className="brand-title">
                <span className="brand-gradient">All Files Convert!</span>
              </span>
              <span className="brand-sub">
                <ExtFlip />
                {t("convert.tagline")}
              </span>
            </span>
          </a>

          <div className="header-actions">
            <button type="button" className="ghost-btn" onClick={showHelp} title={t("convert.helpTitle")}>
              <HelpCircle size={18} />
              <span className="hide-sm">{t("convert.help")}</span>
            </button>
            <button
              type="button"
              className={`ghost-btn ${isAdvanced ? "is-on" : ""}`}
              onClick={toggleMode}
              aria-pressed={isAdvanced}
              title={t(isAdvanced ? "convert.advancedOnTitle" : "convert.advancedOffTitle")}
            >
              <Wrench size={18} />
              <span className="hide-sm">{t(isAdvanced ? "convert.advancedMode" : "convert.simpleMode")}</span>
            </button>
            <button
              type="button"
              className="ghost-btn lang-btn"
              onClick={switchLang}
              title={t("common.switchLanguage", { name: nextLangName() })}
              aria-label={t("common.switchLanguage", { name: nextLangName() })}
            >
              <Globe size={18} />
              <span className="lang-short">{langShort()}</span>
            </button>
            <button
              type="button"
              className="ghost-btn round"
              onClick={toggleTheme}
              title={t("common.theme")}
              aria-label={t("common.themeToggle")}
            >
              {theme.value === "ytlight" ? <Moon size={20} /> : <Sun size={20} />}
            </button>
          </div>
        </div>
      </div>
      <div className="glow-line" />
    </header>
  );
}

/** A tool in the side menu. */
function ToolLink({ tool }: { tool: Tool }) {
  // Highlighted on its own page (and a hub on its tools' pages); only its own page is not reloaded.
  const active = isActive(tool, THIS_TOOL);
  const here = tool.id === THIS_TOOL;
  return (
    <li>
      <a
        href={`${SITE_ROOT}${tool.path}`}
        className={active ? "menu-active" : ""}
        aria-current={here ? "page" : undefined}
        title={t(`hub.tools.${tool.id}.blurb`)}
        onClick={here ? stayHere : undefined}
      >
        <span className="tool-icon" dangerouslySetInnerHTML={{ __html: tool.icon }} />
        {tool.name}
      </a>
    </li>
  );
}

/** A dropdown in the side menu (Game → Minecraft → tools), same as src/components/SideBranch.astro. */
function SideBranch({ branch, level = 0 }: { branch: MenuBranch; level?: number }) {
  return (
    <details className="side-tree" open={branchHas(branch, THIS_TOOL)} style={{ "--lvl": level }}>
      <summary className="side-branch">
        <span className="tool-icon" dangerouslySetInnerHTML={{ __html: MENU_ICONS[branch.id] ?? "" }} />
        <span className="side-branch-name">{t(`hub.menu.${branch.id}`)}</span>
        <svg className="side-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </summary>
      <div className="side-tree-body">
        {branch.children.map((child) => (
          <SideBranch key={child.id} branch={child} level={level + 1} />
        ))}
        {branch.tools.length > 0 && (
          <ul className="side-list side-leaves" style={{ "--lvl": level + 1 }}>
            {branch.tools.map((tool) => (
              <ToolLink key={tool.id} tool={tool} />
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function SideMenu() {
  return (
    <aside id="side-menu" className="side-menu frost">
      {/* Same menu as the YouTube → MP3 page (src/pages/index.astro), built from shared/sgoi.ts. */}
      <a className="hub-brand" href={SITE_ROOT}>
        <span className="sgoi-badge" aria-hidden="true">
          <SgoiLetters />
        </span>
        <span>
          <span className="hub-name brand-gradient">{HUB.suffix}</span>
          <span className="hub-owner">{t("common.by", { owner: HUB.owner })}</span>
        </span>
      </a>

      {sideMenu().map((item) =>
        "branch" in item ? (
          <SideBranch key={item.branch.id} branch={item.branch} />
        ) : (
          <Fragment key={item.group.id}>
            <div className="side-label">{t(`hub.groups.${item.group.id}`)}</div>
            <ul className="side-list">
              {shownTools(item.group).map((tool) => (
                <ToolLink key={tool.id} tool={tool} />
              ))}
            </ul>
          </Fragment>
        ),
      )}

      <div className="side-label soon-label">{t("hub.comingSoon")}</div>
      <ul className="side-soon-list">
        {COMING_SOON.map((item) => (
          <li key={item.id} className="side-soon">
            <span className="tool-icon" dangerouslySetInnerHTML={{ __html: item.icon }} />
            <span>{t(`hub.coming.${item.id}.title`)}</span>
            <span className="soon-badge">{t("hub.soon")}</span>
          </li>
        ))}
      </ul>

      {/* same links on every page, pinned to the bottom right above the tip */}
      <ul className="side-list side-links">
        {MENU_LINKS.map((l) => (
          <li key={l.name}>
            <a href={l.url} target="_blank" rel="noopener">
              <span className="tool-icon" dangerouslySetInnerHTML={{ __html: l.icon }} />
              {l.name}
            </a>
          </li>
        ))}
      </ul>

      <div className="side-tip" dangerouslySetInnerHTML={{ __html: t("common.tip") }} />
    </aside>
  );
}

/** Same footer as the other SGOI pages (src/layouts/SgoiLayout.astro), built from shared/sgoi.ts. */
function Footer() {
  return (
    <footer className="site-footer">
      <div className="glow-line" />
      <div className="site-footer-grid">
        <aside className="footer-about">
          <a className="sgoi-name footer-brand-title" href={SITE_ROOT} aria-label={HUB.name}>
            <span className="sgoi-badge" aria-hidden="true">
              <SgoiLetters />
            </span>
            {/* "Tools": the badge is the "SGOI" of "SGOI Tools" */}
            <span aria-hidden="true">{HUB.suffix}</span>
          </a>
          <p>{t("hub.tagline")}</p>
        </aside>
        {TOOL_GROUPS.map((group) => (
          <nav key={group.id}>
            <h6>{t(`hub.groups.${group.id}`)}</h6>
            {shownTools(group).map((tool) => (
              <a key={tool.id} href={`${SITE_ROOT}${tool.path}`}>
                <span className="tool-icon" dangerouslySetInnerHTML={{ __html: tool.icon }} />
                {tool.name}
              </a>
            ))}
          </nav>
        ))}
        <nav>
          <h6 className="soon-label">{t("hub.comingSoon")}</h6>
          {COMING_SOON.map((item) => (
            <span key={item.id} className="soon">
              <span className="tool-icon" dangerouslySetInnerHTML={{ __html: item.icon }} />
              {t(`hub.coming.${item.id}.title`)}
            </span>
          ))}
        </nav>
        <nav>
          <h6>{t("common.builtWith")}</h6>
          {CREDITS.map((c) => (
            <a key={c.name} href={c.url} target="_blank" rel="noopener">
              {c.name}
            </a>
          ))}
        </nav>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} {HUB.name} · {t("common.madeBy")}{" "}
          <a href={HUB.ownerUrl} target="_blank" rel="noopener">
            {HUB.owner}
          </a>{" "}
          · {t("common.rights")}
        </span>
        <span className="footer-social">
          {MENU_LINKS.map((l) => (
            <a
              key={l.name}
              href={l.url}
              target="_blank"
              rel="noopener"
              title={l.name}
              aria-label={l.name}
              dangerouslySetInnerHTML={{ __html: l.icon }}
            />
          ))}
        </span>
      </div>
    </footer>
  );
}

export default function SiteShell({ children }: SiteShellProps) {
  const open = sideOpen.value;

  return (
    <>
      <div className="aurora" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="shell">
        <SideMenu />
        <div className="shell-overlay" onClick={() => (sideOpen.value = false)} />

        <div className="shell-content">
          <Header />
          <main id="top" className="shell-main">
            {children}
          </main>
          <Footer />
        </div>
      </div>

      <button
        type="button"
        className="hamburger"
        aria-controls="side-menu"
        aria-expanded={open}
        aria-label={t(open ? "common.closeMenu" : "common.openMenu")}
        title={t(open ? "common.closeMenu" : "common.openMenu")}
        onClick={toggleSide}
      >
        <span />
        <span />
        <span />
      </button>
    </>
  );
}
