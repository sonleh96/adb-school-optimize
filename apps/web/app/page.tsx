import type { Metadata } from "next";
import { getImageProps, type ImageProps } from "next/image";

import { AdbLogo } from "@/components/AdbLogo";
import { LeftOutMotif, RangeMotif, RunsMotif } from "@/components/home/Motifs";
import { HOME, KEEP_TOGETHER, MAIN_SHARES, figuresFor, type Figure, type Phrase } from "@/lib/home/copy";
import { readHomeCounts } from "@/lib/home/counts";
import { HIDE_FAILED_PICTURES } from "@/lib/home/hideFailedPictures";
import { LAYOUT } from "@/lib/screening/copy/words";
import orbit from "@/public/images/png-from-orbit.webp";
import provinces from "@/public/images/png-provinces.svg";
import toolDesktop from "@/public/images/tool-desktop.webp";
import toolRows from "@/public/images/tool-phone-rows.webp";
import toolPhone from "@/public/images/tool-phone.webp";

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

/** The alt text of a picture that only decorates: screen readers skip it, and the words beside it say everything. */
const DECORATIVE = "";

/** One drawing per note, in the notes' order: a range of ranks, the urgency rating left out, four runs in five. */
const NOTE_MOTIFS = [RangeMotif, LeftOutMotif, RunsMotif] as const;

/**
 * A picture as a plain <img> with next/image's resized copies in its srcset. The <Image> component would bring its
 * client script, about 5.6 KiB gzip, which the homepage's 138 KiB budget cannot spare; the page needs none of what
 * that script does. A picture below the fold loads lazily, as <Image> would load it.
 */
function Picture(options: ImageProps) {
  const { props } = getImageProps(options);
  // eslint-disable-next-line @next/next/no-img-element -- getImageProps gives the <img> next/image would draw.
  return <img {...props} alt={options.alt} />;
}

/**
 * The hero's screenshot, the first view's largest picture, so it loads first. A wide screen gets the whole tool.
 * Below 768 px the whole tool would be drawn too small to read, so a phone gets the phone's own list: its first two
 * rows with their Why lines, at the size the phone draws them, from the same test data.
 */
function HeroShot() {
  const rows = getImageProps({
    src: toolRows,
    alt: HOME.images.tool,
    sizes: "(max-width: 479px) 92vw, 440px",
    quality: 85,
  }).props;
  const { props } = getImageProps({
    src: toolDesktop,
    alt: HOME.images.tool,
    sizes: "(min-width: 1296px) 680px, (min-width: 1024px) 53vw, 92vw",
    quality: 85,
    loading: "eager",
    fetchPriority: "high",
  });
  return (
    <picture>
      <source
        media="(max-width: 767px)"
        srcSet={rows.srcSet}
        sizes={rows.sizes}
        width={rows.width}
        height={rows.height}
      />
      <img {...props} className={styles.shot} alt={HOME.images.tool} />
    </picture>
  );
}

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

/**
 * What the records cover: the three counts, or the three groups in words when the counts are not known. The second
 * and third rows hang from the first, as the paper's workflow splits every record into the schools that can be put
 * in order and the records to verify first (lib/home/counts.ts holds the counts to that sum).
 */
function Figures({ figures }: { figures: readonly Figure[] | null }) {
  return (
    <div className={styles.figures} data-testid="home-figures">
      <p id="home-figures-title" className={styles.cardEyebrow}>
        {HOME.hero.figuresTitle}
      </p>
      <ul className={styles.figureList} aria-labelledby="home-figures-title">
        {figures
          ? figures.map((f, i) => (
              <li key={f.key} className={styles.figure} data-branch={i > 0 || undefined}>
                <span className={styles.figureValue}>{f.value}</span>{" "}
                <span className={styles.figureLabel}>{f.label}</span>
              </li>
            ))
          : HOME.hero.noFigures.map((row, i) => (
              <li key={row.term} className={styles.figure} data-kind="words" data-branch={i > 0 || undefined}>
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
      {/* Before any picture, so a picture that fails is hidden rather than left as a broken frame. */}
      <script dangerouslySetInnerHTML={{ __html: HIDE_FAILED_PICTURES }} />
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
            <div className={styles.heroText}>
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
            {/* The tool in a browser window, with the counts card over the map's empty corner. */}
            <div className={styles.stage}>
              <figure className={styles.browser}>
                <figcaption className={styles.browserBar}>{HOME.images.caption}</figcaption>
                <HeroShot />
              </figure>
              <Figures figures={figures} />
            </div>
          </div>
        </section>

        <section className={`${styles.band} ${styles.navy}`} aria-labelledby="home-scope">
          {/* Papua New Guinea from orbit, in the band's navy, behind the words. */}
          <Picture
            className={styles.backdrop}
            src={orbit}
            alt={DECORATIVE}
            sizes="(min-width: 768px) 72vw, 170vw"
            quality={75}
          />
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
                {HOME.method.notes.map((note, i) => {
                  const Motif = NOTE_MOTIFS[i];
                  return (
                    <li key={note.title} className={styles.note}>
                      <span className={styles.noteHead}>
                        <span className={styles.noteNumber} aria-hidden="true">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {Motif ? <Motif className={styles.noteMotif} /> : null}
                      </span>
                      <h4 className={styles.noteTitle}>{note.title}</h4>
                      <p className={styles.noteBody}>{note.body}</p>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </section>

        <section
          id="use"
          className={`${styles.band} ${styles.white} ${styles.useBand}`}
          aria-labelledby="home-use"
        >
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
            {/* The list on a phone, rising from the band's foot, with one of its rows drawn large in front of it. */}
            <div className={styles.useStage}>
              <div className={styles.phone}>
                <Picture
                  className={styles.shot}
                  src={toolPhone}
                  alt={HOME.images.phone}
                  sizes="280px"
                  quality={85}
                />
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
          </div>
        </section>

        <section
          id="research"
          className={`${styles.band} ${styles.paper} ${styles.aboutBand}`}
          aria-labelledby="home-research"
        >
          {/* The country and its 22 provinces, drawn faint behind the study, with no school on it. */}
          <Picture className={styles.mapBackdrop} src={provinces} alt={DECORATIVE} />
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
        <div className={styles.wrap}>
          <ul className={styles.credits} aria-label={HOME.images.creditsLabel}>
            {HOME.images.credits.map((credit) => (
              <li key={credit.href}>
                <a href={credit.href}>{credit.text}</a>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </div>
  );
}
