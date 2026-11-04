import type { Metadata } from "next";

import { AdbLogo } from "@/components/AdbLogo";
import { HOME, KEEP_TOGETHER, MAIN_SHARES, figuresFor, type Phrase } from "@/lib/home/copy";
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

/** The main method's weights as the bar draws them: school need, district context, then the four smaller parts. */
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

/** The people to write to, each with their full address as the link's text. */
function People({ className }: { className: string }) {
  return (
    <ul className={className}>
      {HOME.contact.people.map((person) => (
        <li key={person.email}>
          {person.name}, <a href={`mailto:${person.email}`}>{person.email}</a>
        </li>
      ))}
    </ul>
  );
}

/** A rank with its ordinal set small and raised, as the list sets it. */
function Rank({ text }: { text: string }) {
  const [, number = text, ordinal = ""] = text.match(/^(\d+)(\D*)$/) ?? [];
  return (
    <>
      {number}
      <span className={styles.ordinal}>{ordinal}</span>
    </>
  );
}

export default async function HomePage() {
  const figures = figuresFor(await readHomeCounts(process.env.SCREENING_API_ORIGIN ?? ""));
  const { example } = HOME.use;
  const footerLinks = [
    [HOME.footer.links.open, TOOL.list],
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
              <p className={styles.who}>
                <Unbroken text={HOME.hero.who} />
              </p>
            </div>
            <div className={styles.figures} data-testid="home-figures">
              <p id="home-figures-title" className={styles.cardEyebrow}>
                {HOME.hero.figuresTitle}
              </p>
              <ul className={styles.figureList} aria-labelledby="home-figures-title">
                {figures
                  ? figures.map((f) => (
                      <li key={f.key} className={styles.figure}>
                        <span className={styles.figureValue}>{f.value}</span>{" "}
                        <span className={styles.figureLabel}>{f.label}</span>
                      </li>
                    ))
                  : HOME.hero.noFigures.map((row) => (
                      <li key={row.term} className={styles.figure} data-kind="words">
                        <span className={styles.figureTerm}>{row.term}</span>{" "}
                        <span className={styles.figureLabel}>{row.text}</span>
                      </li>
                    ))}
              </ul>
              <p className={styles.figuresNote}>{HOME.hero.figuresNote}</p>
              <a className={styles.arrowLink} href={TOOL.queue}>
                {HOME.hero.queueLink}
              </a>
            </div>
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

            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>{HOME.method.weightsTitle}</h3>
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
                {HOME.method.weights.map((w) => (
                  <li key={w.key} className={styles.shareItem} data-factor={w.key}>
                    <span className={styles.shareValue}>{w.share}</span>{" "}
                    <span className={styles.shareName}>{w.name}</span>{" "}
                    <span className={styles.shareLine}>
                      <Unbroken text={w.line} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.notes}>
              <h3 className={styles.panelTitle}>{HOME.method.notesTitle}</h3>
              <ol className={styles.noteList}>
                {HOME.method.notes.map((note, i) => (
                  <li key={note.title} className={styles.note}>
                    <span className={styles.noteNumber} aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h4 className={styles.noteTitle}>{note.title}</h4>
                    <p className={styles.noteBody}>{note.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="use" className={`${styles.band} ${styles.white}`} aria-labelledby="home-use">
          <div className={`${styles.wrap} ${styles.useGrid}`}>
            <div>
              <p className={styles.eyebrow}>{HOME.use.eyebrow}</p>
              <h2 id="home-use" className={styles.title}>
                {HOME.use.title}
              </h2>
              <ol className={styles.strip}>
                {HOME.use.steps.map((step, i) => (
                  <li key={step} className={styles.stripStep}>
                    <span className={styles.stepNumber} aria-hidden="true">
                      {i + 1}
                    </span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
            </div>
            <figure className={styles.example}>
              <div className={styles.exampleRow}>
                <span className={styles.exampleRank}>
                  <Rank text={example.rank} />
                </span>
                <span className={styles.exampleText}>
                  <span className={styles.exampleName}>{example.name}</span>{" "}
                  <span className={styles.exampleWhere}>· {example.where}</span>
                  <span className={styles.exampleWhy}>
                    <b className={styles.exampleWhyKey}>{LAYOUT.whyKey}</b> {example.why}
                  </span>
                </span>
              </div>
              <figcaption className={styles.exampleCaption}>{example.caption}</figcaption>
            </figure>
          </div>
        </section>

        <section id="research" className={`${styles.band} ${styles.paper}`} aria-labelledby="home-research">
          <div className={`${styles.wrap} ${styles.aboutGrid}`}>
            <div>
              <p className={styles.eyebrow}>{HOME.research.eyebrow}</p>
              <h2 id="home-research" className={styles.title}>
                {HOME.research.title}
              </h2>
              {HOME.research.sentences.map((sentence) => (
                <p key={sentence} className={styles.aboutText}>
                  <Unbroken text={sentence} />
                </p>
              ))}
            </div>
            <div>
              <div className={styles.status}>
                <h3 className={styles.statusTitle}>{HOME.research.status.title}</h3>
                {HOME.research.status.sentences.map((sentence) => (
                  <p key={sentence} className={styles.statusText}>
                    {sentence}
                  </p>
                ))}
              </div>
              <h3 className={styles.contactTitle}>{HOME.contact.title}</h3>
              <People className={styles.people} />
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
          <nav className={styles.footNav} aria-label={HOME.footer.navLabel}>
            <ul>
              {footerLinks.map(([label, href]) => (
                <li key={href}>
                  <a href={href}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className={styles.footContact}>
            <p className={styles.footContactTitle}>{HOME.footer.contactTitle}</p>
            <People className={styles.footPeople} />
          </div>
        </div>
      </footer>
    </div>
  );
}
