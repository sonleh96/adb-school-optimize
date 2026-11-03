import type { Metadata } from "next";

import { AdbLogo } from "@/components/AdbLogo";
import { HOME, KEEP_TOGETHER, MAIN_SHARES, figuresFor, type Figure, type Phrase } from "@/lib/home/copy";
import { readHomeCounts } from "@/lib/home/counts";
import { LAYOUT } from "@/lib/screening/copy/words";

import { homeFonts } from "./fonts";
import styles from "./home.module.css";

// Made when the app is built, then again at most once an hour, on a request, in the background: the page stays a
// static file and its counts follow the API (lib/home/counts.ts). Next.js reads this value from the source.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: HOME.meta.title,
  description: HOME.meta.description,
};

/** Where the homepage's links go in the tool: the list, its "Not in the list yet" tab, and the guides' first card. */
const TOOL = {
  list: "/screening",
  queue: "/screening?view=queue",
  guides: "/screening?guide=start",
} as const;

/** The problem cards' surfaces, in order: a navy card, a plain one and a tinted one, as Darkhorse sets theirs. */
const CARD_TONES = ["navy", "plain", "tint"] as const;

/** The main method's shares as the bar draws them: school need, district context, then the four smaller factors. */
const SEGMENTS = (Object.entries(MAIN_SHARES) as [keyof typeof MAIN_SHARES, number][]).map(
  ([key, share]) => ({
    key,
    share,
    group: key === "N" || key === "A" ? key : "small",
  })
);

function PhraseText({ phrase }: { phrase: Phrase }) {
  return phrase.map((part, i) =>
    typeof part === "string" ? (
      part
    ) : (
      <span key={i} className={styles.accent}>
        {part.accent}
      </span>
    )
  );
}

/** Text whose names and grades stay on one line (`KEEP_TOGETHER`): `split` puts each one at an odd index. */
function Unbroken({ text }: { text: string }) {
  return text.split(KEEP_TOGETHER).map((part, i) =>
    i % 2 === 0 ? (
      part
    ) : (
      <span key={i} className={styles.together}>
        {part}
      </span>
    )
  );
}

/** A box in the path of a record: its figure and a title that agrees with it when the count is known. */
function PathBox({
  step,
  figure,
  tone,
}: {
  step: { title: string; note: string };
  figure?: Figure;
  tone: "all" | "in" | "verify" | "visit";
}) {
  return (
    <div className={styles.box} data-tone={tone}>
      {figure ? <p className={styles.boxValue}>{figure.value}</p> : null}
      <p className={styles.boxTitle}>{figure?.title ?? step.title}</p>
      <p className={styles.boxNote}>{step.note}</p>
    </div>
  );
}

export default async function HomePage() {
  const figures = figuresFor(await readHomeCounts(process.env.SCREENING_API_ORIGIN ?? ""));
  const figure = (key: Figure["key"]) => figures?.find((f) => f.key === key);
  const footerLinks = [
    [HOME.footer.links.open, TOOL.list],
    [HOME.footer.links.how, "#how"],
    [HOME.footer.links.use, "#use"],
    [HOME.footer.links.research, "#research"],
    [HOME.footer.links.queue, TOOL.queue],
    [HOME.footer.links.guides, TOOL.guides],
  ] as const;

  return (
    <div className={`${homeFonts} ${styles.page}`}>
      <a className={styles.skip} href="#main">
        {HOME.skip}
      </a>

      <header className={styles.masthead}>
        <div className={`${styles.wrap} ${styles.mastInner}`}>
          <AdbLogo className={styles.logo} label={LAYOUT.logoAria} />
          <p className={styles.mastName}>{LAYOUT.productName}</p>
          <p className={styles.mastSub}>{LAYOUT.productSub}</p>
          <a className={`${styles.button} ${styles.primary} ${styles.mastButton}`} href={TOOL.list}>
            {HOME.open}
          </a>
        </div>
      </header>

      <main id="main" tabIndex={-1} className={styles.main}>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div>
              <p className={styles.eyebrow}>
                <Unbroken text={HOME.hero.eyebrow} />
              </p>
              <h1 id="home-title" className={styles.display}>
                <PhraseText phrase={HOME.hero.title} />
              </h1>
              <p className={styles.heroLead}>
                <Unbroken text={HOME.hero.lead} />
              </p>
              <div className={styles.actions}>
                <a className={`${styles.button} ${styles.primary}`} href={TOOL.list}>
                  {HOME.open}
                </a>
                <a className={`${styles.button} ${styles.secondary}`} href="#how">
                  {HOME.hero.how}
                </a>
              </div>
            </div>
            <div className={styles.figures} data-testid="home-figures">
              <p id="home-figures-title" className={styles.cardEyebrow}>
                {HOME.hero.figuresTitle}
              </p>
              {figures ? (
                <>
                  <ul className={styles.figureList} aria-labelledby="home-figures-title">
                    {figures.map((f) => (
                      <li key={f.key} className={styles.figure}>
                        <span className={styles.figureValue}>{f.value}</span>{" "}
                        <span className={styles.figureLabel}>{f.label}</span>
                      </li>
                    ))}
                  </ul>
                  <p className={styles.figuresNote}>{HOME.hero.figuresNote}</p>
                </>
              ) : (
                HOME.hero.noFigures.map((text) => (
                  <p key={text} className={styles.figuresText}>
                    {text}
                  </p>
                ))
              )}
              <a className={styles.arrowLink} href={TOOL.queue}>
                {HOME.hero.queueLink}
              </a>
            </div>
          </div>
        </section>

        <section className={`${styles.band} ${styles.white}`} aria-labelledby="home-problem">
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>{HOME.problem.eyebrow}</p>
            <h2 id="home-problem" className={styles.title}>
              {HOME.problem.title}
            </h2>
            <p className={styles.lead}>{HOME.problem.lead}</p>
            <ul className={styles.cards}>
              {HOME.problem.cards.map((card, i) => (
                <li key={card.title} className={styles.card} data-tone={CARD_TONES[i]}>
                  <p className={styles.cardEyebrow}>{card.eyebrow}</p>
                  <h3 className={styles.cardTitle}>{card.title}</h3>
                  <p className={styles.cardBody}>{card.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={`${styles.band} ${styles.navy}`} aria-labelledby="home-scope">
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>{HOME.scope.eyebrow}</p>
            <h2 id="home-scope" className={styles.statement}>
              {HOME.scope.title}
            </h2>
            <p className={styles.lead}>{HOME.scope.lead}</p>
            <div className={styles.columns}>
              {[
                { group: HOME.scope.does, kind: "does" },
                { group: HOME.scope.doesNot, kind: "not" },
              ].map(({ group, kind }) => (
                <div key={kind} className={styles.column} data-kind={kind}>
                  <h3 className={styles.columnTitle}>{group.title}</h3>
                  <ul className={styles.marks}>
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className={`${styles.band} ${styles.paper}`} aria-labelledby="home-how">
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>{HOME.method.eyebrow}</p>
            <h2 id="home-how" className={styles.title}>
              {HOME.method.title}
            </h2>
            <p className={styles.lead}>{HOME.method.lead}</p>

            <div className={`${styles.panel} ${styles.method}`}>
              <h3 className={styles.panelTitle}>{HOME.method.sharesTitle}</h3>
              <div className={styles.shareBar} aria-hidden="true">
                {SEGMENTS.map((s) => (
                  <span
                    key={s.key}
                    className={styles.segment}
                    data-factor={s.group}
                    style={{ flexGrow: s.share }}
                  />
                ))}
              </div>
              <ul className={styles.shareList}>
                {HOME.method.shares.map((s) => (
                  <li key={s.key} className={styles.shareItem} data-factor={s.key}>
                    <span className={styles.shareValue}>{s.share}</span>{" "}
                    <span className={styles.shareName}>{s.name}</span>{" "}
                    <span className={styles.shareLine}>
                      <Unbroken text={s.line} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <figure className={`${styles.panel} ${styles.method}`}>
              <h3 className={styles.panelTitle}>{HOME.method.pathTitle}</h3>
              <ol className={styles.path}>
                <li className={styles.stage}>
                  <PathBox step={HOME.method.path.records} figure={figure("records")} tone="all" />
                </li>
                <li className={styles.stage}>
                  <ul className={styles.fork}>
                    <li>
                      <PathBox step={HOME.method.path.inOrder} figure={figure("inOrder")} tone="in" />
                    </li>
                    <li>
                      <PathBox step={HOME.method.path.toVerify} figure={figure("toVerify")} tone="verify" />
                    </li>
                  </ul>
                </li>
                <li className={styles.stage}>
                  <PathBox step={HOME.method.path.visit} tone="visit" />
                </li>
              </ol>
              <figcaption className={styles.caption}>{HOME.method.pathCaption}</figcaption>
            </figure>

            <div className={styles.checks}>
              <h3 className={styles.panelTitle}>{HOME.method.checksTitle}</h3>
              <ol className={styles.checkList}>
                {HOME.method.checks.map((check, i) => (
                  <li key={check.title} className={styles.check}>
                    <span className={styles.checkNumber} aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h4 className={styles.checkTitle}>{check.title}</h4>
                    <p className={styles.checkBody}>{check.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="use" className={`${styles.band} ${styles.white}`} aria-labelledby="home-use">
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>{HOME.use.eyebrow}</p>
            <h2 id="home-use" className={styles.title}>
              {HOME.use.title}
            </h2>
            <ol className={styles.steps}>
              {HOME.use.steps.map((step, i) => (
                <li key={step.title} className={styles.step}>
                  <span className={styles.stepNumber} aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepBody}>{step.body}</p>
                </li>
              ))}
            </ol>
            <div className={styles.actions}>
              <a className={`${styles.button} ${styles.primary}`} href={TOOL.list}>
                {HOME.open}
              </a>
              <a className={`${styles.button} ${styles.secondary}`} href={TOOL.guides}>
                {HOME.use.guides}
              </a>
            </div>
          </div>
        </section>

        <section id="research" className={`${styles.band} ${styles.paper}`} aria-labelledby="home-research">
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>{HOME.research.eyebrow}</p>
            <h2 id="home-research" className={styles.title}>
              {HOME.research.title}
            </h2>
            <p className={styles.lead}>{HOME.research.lead}</p>
            <div className={styles.research}>
              {[
                { part: HOME.research.data, tone: "plain" },
                { part: HOME.research.limits, tone: "plain" },
                { part: HOME.research.status, tone: "ink" },
              ].map(({ part, tone }) => (
                <div key={part.title} className={styles.researchCard} data-tone={tone}>
                  <h3 className={styles.cardTitle}>{part.title}</h3>
                  <div className={styles.researchText}>
                    {part.sentences.map((sentence) => (
                      <p key={sentence} className={styles.cardBody}>
                        <Unbroken text={sentence} />
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footGrid}`}>
          <div className={styles.footBrand}>
            <span className={styles.plate}>
              <AdbLogo className={styles.footLogo} label={LAYOUT.logoAria} />
            </span>
            <div>
              <p className={styles.footName}>{LAYOUT.productName}</p>
              <p className={styles.footSub}>{LAYOUT.productSub}</p>
            </div>
          </div>
          <p className={styles.footAbout}>
            <Unbroken text={HOME.footer.about} />
          </p>
          <nav className={styles.footNav} aria-label={HOME.footer.navLabel}>
            <ul>
              {footerLinks.map(([label, href]) => (
                <li key={href}>
                  <a href={href}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <p className={styles.footCaveat}>{HOME.footer.caveat}</p>
        </div>
      </footer>
    </div>
  );
}
