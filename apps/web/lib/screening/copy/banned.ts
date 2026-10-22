/** Words and forms the plain copy never uses. A test scans every generated sentence, label and help text for them. */

/* --------------------------------------------------- plain-word guardrails */
// Words and forms the plain copy never uses. The check script scans every generated sentence, label and help text.

export const BANNED = Object.freeze([
  { pattern: /\brisk/i, why: "No input measures risk; the screen proposes inspection attention only." },
  {
    pattern: /(?<!real )\bhazard(?!-related)/i,
    why: "The urgency rating is described as hazard-related, but how it was made could not be traced. Only say what leaving it out does not say, about real hazards.",
  },
  {
    pattern: /\bflood(?!ed vegetation)/i,
    why: "Land cover is a share of water and flooded vegetation, not a flood measure.",
  },
  { pattern: /\b(un)?safe\b/i, why: "The screen does not establish site safety." },
  { pattern: /\bdanger/i, why: "Same reason as safety." },
  { pattern: /\bworst\b(?! 1 day in 20)/i, why: "Reads as a judgement of a school; use lowest place." },
  { pattern: /\bbest\b/i, why: "Reads as a judgement of a school or of a rule." },
  { pattern: /\bexclu(de|ded|sion)/i, why: "These schools are waiting for complete records, not shut out." },
  { pattern: /\breject/i, why: "Same reason as excluded." },
  { pattern: /\bfail(ed|s|ure)?\b/i, why: "A record gap is not a school failing." },
  { pattern: /\beligib/i, why: "Reads as eligible for funding; say can be put in order." },
  {
    pattern: /(?<!not an order of )\bpriorit/i,
    why: "Implies a decision; the order of schools with incomplete records is not a priority order.",
  },
  {
    pattern: /\bgood condition|\bpoor condition|\bin need of repair/i,
    why: "The screen does not establish condition.",
  },
  {
    pattern: /\bneediest|\bmost deprived|\bpoorest/i,
    why: "A place reflects records and fixed shares, not verified need.",
  },
  { pattern: /(?<!not a )\bverdict/i, why: "Only used to say a place is not a verdict." },
  {
    pattern: /\bprobabilit|\bconfidence|\bmargin of error/i,
    why: "Ranges are bounds from a missing figure, not statistical uncertainty.",
  },
  { pattern: /\bimput|\bestimated value/i, why: "Missing values are never filled in." },
  {
    pattern: /\benvironmental (risk|score|index)/i,
    why: "Air quality, emissions and land cover are separate measures.",
  },
  { pattern: /\bqueue_priority|verification order/i, why: "That signal comes from an older method." },
  {
    pattern:
      /\bnot ranked\b|\brecords to check\b|\bcondition records?\b|\bin the ranking\b|\bverification queue\b/i,
    why: "Retired: these are schools with incomplete records.",
  },
  {
    pattern: /\bplaced\b/i,
    why: "Retired in round 3: testers read it as chosen or approved; say can be put in order.",
  },
  { pattern: /\bscreening scores?\b/i, why: "Say score: screening reads as a check on people." },
  {
    pattern: /\breading counts as\b|\bcounts? as 0\b(?! or)/i,
    why: "Reads as scoring zero; say where they would sit if air quality added nothing.",
  },
  {
    pattern: /random-weight|\b\w+\.json\b|\.csv\b/i,
    why: "Method and file names belong in analyst copy; cite the study's recorded comparison.",
  },
  { pattern: /\bthe authors\b/i, why: "Name them as the research team." },
  {
    pattern: /\bweighted\b|\bweighting\b/i,
    why: "Testers could not decode it; say combined factors, each with a fixed share.",
  },
  { pattern: /\bshortlist|\bbriefing stops?\b/i, why: "Say the top list and saved views for meetings." },
  { pattern: /\bcod(e|es|ed|ing)\b/i, why: "Say what the scale is: a scale the study set." },
  { pattern: /\bprogressing\b/i, why: "Say moving on from Grade 7 to Grade 10." },
  { pattern: /\bnot used\b/i, why: "Read as not important; say left out by this rule." },
  { pattern: /\btarget\b/i, why: "Read as goals; name the mark, a ring with a centre dot." },
  {
    pattern: /\bschools come first\b/i,
    why: "One framing for agreement: the same 20 schools make the top 20.",
  },
]);
