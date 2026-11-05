import type { Metadata } from "next";

import { AdbLogo } from "@/components/AdbLogo";
import { ExploreData } from "@/components/explore/ExploreData";
import styles from "@/components/explore/explore.module.css";
import { HOME } from "@/lib/home/copy";
import { EXPLORE } from "@/lib/screening/copy/explore";
import { PRIMARY_RULE } from "@/lib/screening/copy/rules";
import { LAYOUT } from "@/lib/screening/copy/words";

export const metadata: Metadata = { title: EXPLORE.title };

/**
 * Charts of every school the main method puts in order. The page is static: its heading and words are in the HTML,
 * and the charts load in the browser from the routes the workspace reads. Nothing sits below the charts, so their
 * arrival moves nothing a reader is looking at. Like the workspace, it asks for sign-in when sign-in is on (proxy.ts)
 * and stays out of search engines (robots.ts).
 */
export default function ExplorePage() {
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#charts">
        {EXPLORE.skip}
      </a>
      <header className={styles.masthead}>
        <div className={styles.mastInner}>
          <AdbLogo className={styles.logo} label={LAYOUT.logoAria} />
          <p className={styles.mastName}>{LAYOUT.productName}</p>
          <p className={styles.mastSub}>{LAYOUT.productSub}</p>
          <a className={styles.mastLink} href="/screening">
            {HOME.open}
          </a>
        </div>
      </header>
      <main id="main" className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.title}>{EXPLORE.title}</h1>
          <p className={styles.lede}>{EXPLORE.lede}</p>
          <p className={styles.caveat}>{EXPLORE.caveat}</p>
        </div>
        <div id="charts" tabIndex={-1} className={styles.charts}>
          <ExploreData
            rule={PRIMARY_RULE}
            words={{
              loading: EXPLORE.loading,
              failed: LAYOUT.loadFailed,
              retry: LAYOUT.retry,
              empty: LAYOUT.emptyData,
            }}
          />
        </div>
      </main>
    </div>
  );
}
