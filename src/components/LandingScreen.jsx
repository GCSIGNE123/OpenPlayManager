import { useState } from "react";
import {
  Menu,
  X,
  Plus,
  LogIn,
  ArrowRight,
  Shuffle,
  Users,
  Repeat,
  Clock,
  Layers,
  Radio,
  Zap,
  Undo2,
  Tv,
  Trophy,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { styles } from "../styles.js";
import { APP_NAME, FOOTER_TEXT } from "../lib/brand.js";

// PickleKing Marketing Landing Page — see PROJECT.md/FEATURES.md. Replaces
// the old admin-directory-style home screen with a real SaaS product page,
// while keeping every existing prop/handler byte-for-byte the same
// (onCreate/handleJoin/onAdmin/onDeveloper/etc. all still wired to the
// exact same screens in PickleballOpenPlay.jsx — this is a presentation-
// layer change only). Internal organizer/admin/developer links are moved
// into a collapsed "Organizer & Admin Tools" panel at the very bottom of
// the page (see ToolsPanel below) rather than deleted, per explicit
// instruction not to remove any existing capability.
//
// The hero/feature "product preview" mockups below are static, styled
// representations built from the app's own real vocabulary and status
// colors (LIVE = --color-success, Next Match = --court, etc. — the same
// tokens CourtCard.jsx/ScorerView.jsx already use) — never the live
// components themselves (no session data exists on a public marketing
// page) and never wired to any onClick/state, so they can never be
// mistaken for real functionality.
export default function LandingScreen({
  onCreate,
  onAdmin,
  onDeveloper,
  onTemplates,
  onPlayerPortal,
  onLeagues,
  onPlayerManagement,
  onVenueManagement,
  onCourtBooking,
  onRatings,
  onTournamentHistory,
  onSessionHistory,
  joinCode,
  setJoinCode,
  handleJoin,
  joinError,
  joining,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const scrollTo = (id) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={styles.mktPage}>
      {/* Responsive rules that plain inline styles can't express (media
          queries) — mirrors the same <style> tag pattern
          SessionAnalyticsReport.jsx already uses for its print rules.
          Below 860px: nav links + Sign In/Get Started collapse into the
          hamburger menu, and the hero goes from two columns to one
          (product mockup stacks below the copy, per the explicit "hero
          should stack vertically on mobile" requirement). */}
      <style>{`
        @media (max-width: 860px) {
          .mkt-nav-links, .mkt-nav-actions { display: none !important; }
          .mkt-mobile-menu-btn { display: flex !important; }
          .mkt-hero-inner { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <Nav onCreate={onCreate} onAdmin={onAdmin} scrollTo={scrollTo} mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      <Hero onCreate={onCreate} scrollTo={scrollTo} joinOpen={joinOpen} setJoinOpen={setJoinOpen} joinCode={joinCode} setJoinCode={setJoinCode} handleJoin={handleJoin} joinError={joinError} joining={joining} />

      <TrustStrip />

      <section id="problem" style={styles.mktSection}>
        <div style={styles.mktSectionInner}>
          <div style={styles.mktSectionHead}>
            <div style={styles.mktSectionKicker}>The problem</div>
            <h2 style={styles.mktSectionHeadline}>Stop Managing Open Play With a Whiteboard.</h2>
          </div>
          <div style={styles.mktProblemGrid}>
            {[
              "Who plays next?",
              "Who has already played too many games?",
              "Who has been waiting the longest?",
              "Which court is available?",
              "Who replaces a latecomer?",
              "What's the next matchup?",
              "What is the current score?",
            ].map((q) => (
              <div key={q} style={styles.mktProblemCard}>
                <span style={styles.mktProblemMark}>?</span>
                {q}
              </div>
            ))}
          </div>
          <p style={styles.mktResolveLine}>PickleKing handles the coordination so you can focus on the game.</p>
        </div>
      </section>

      <section id="features" style={{ ...styles.mktSection, ...styles.mktSectionAlt }}>
        <div style={styles.mktSectionInner}>
          <div style={styles.mktSectionHead}>
            <div style={styles.mktSectionKicker}>Smart rotation</div>
            <h2 style={styles.mktSectionHeadline}>Fairer Games. Smarter Rotation.</h2>
            <p style={styles.mktSectionSub}>
              PickleKing considers games played, skill, partners, opponents and waiting time to create balanced matchups.
            </p>
          </div>
          <div style={styles.mktFeatureGrid}>
            <FeatureCard icon={<Layers size={20} strokeWidth={2.5} />} title="Games Played" text="Help keep participation balanced." />
            <FeatureCard icon={<Shuffle size={20} strokeWidth={2.5} />} title="Skill Balance" text="Create appropriate matchups." />
            <FeatureCard icon={<Users size={20} strokeWidth={2.5} />} title="Partner Diversity" text="Avoid repeatedly pairing the same players." />
            <FeatureCard icon={<Repeat size={20} strokeWidth={2.5} />} title="Opponent Diversity" text="Keep games varied." />
            <FeatureCard icon={<Clock size={20} strokeWidth={2.5} />} title="Waiting Time" text="Don't forget the players who have been waiting." />
          </div>
        </div>
      </section>

      <section id="how-it-works" style={styles.mktSection}>
        <div style={styles.mktSectionInner}>
          <div style={styles.mktSectionHead}>
            <div style={styles.mktSectionKicker}>Queue &amp; courts</div>
            <h2 style={styles.mktSectionHeadline}>Know What's Happening on Every Court.</h2>
          </div>
          <div style={styles.mktCourtsGrid}>
            <CourtMini name="Court 1" status="live" value="LIVE" />
            <CourtMini name="Court 2" status="live" value="LIVE" />
            <CourtMini name="Court 3" status="next" value="NEXT" />
            <CourtMini name="Court 4" status="waiting" value="WAITING" />
          </div>
          <p style={{ ...styles.mktSectionSub, textAlign: "center", marginBottom: 24 }}>
            From check-in to court assignment, PickleKing keeps the session moving.
          </p>
          <div style={styles.mktPillRow}>
            <span style={styles.mktPill}><Radio size={13} strokeWidth={2.5} style={{ verticalAlign: "-2px", marginRight: 5 }} />Smart Queue Management</span>
            <span style={styles.mktPill}><Zap size={13} strokeWidth={2.5} style={{ verticalAlign: "-2px", marginRight: 5 }} />Smart Court Dispatch</span>
            <span style={styles.mktPill}>Next Match</span>
            <span style={styles.mktPill}>Live Scoring</span>
          </div>
        </div>
      </section>

      <section style={{ ...styles.mktSection, ...styles.mktSectionAlt }}>
        <div style={styles.mktSectionInner}>
          <div style={styles.mktSectionHead}>
            <div style={styles.mktSectionKicker}>Latecomers, handled</div>
            <h2 style={styles.mktSectionHeadline}>Someone Just Arrived Late?</h2>
            <p style={styles.mktSectionSub}>Prioritize a latecomer for the next match without disrupting your entire queue.</p>
          </div>
          <div style={styles.mktLatecomerDemo}>
            <div style={styles.mktLatecomerStep}>
              NEW · Ken
              <div style={{ marginTop: 8 }}>
                <span style={styles.mktPill}>Prioritize</span>
              </div>
            </div>
            <ArrowRight size={20} style={styles.mktLatecomerArrow} />
            <div style={styles.mktLatecomerStep}>Current Match</div>
            <ArrowRight size={20} style={styles.mktLatecomerArrow} />
            <div style={styles.mktLatecomerStep}>Proposed Match</div>
            <ArrowRight size={20} style={styles.mktLatecomerArrow} />
            <div style={styles.mktLatecomerStep}>Apply</div>
          </div>
          <p style={{ ...styles.mktSectionSub, textAlign: "center", marginTop: 20 }}>
            <Undo2 size={14} strokeWidth={2.5} style={{ verticalAlign: "-2px", marginRight: 5 }} />
            <strong>Undo</strong> — safe, reversible priority. The organizer stays in control.
          </p>
        </div>
      </section>

      <section id="tv-mode" style={styles.mktSection}>
        <div style={styles.mktSectionInner}>
          <div style={styles.mktSectionHead}>
            <div style={styles.mktSectionKicker}>TV Mode</div>
            <h2 style={styles.mktSectionHeadline}>Put Open Play on the Big Screen.</h2>
          </div>
          <div style={styles.mktTvFrame}>
            <div style={styles.mktTvGrid}>
              <div>
                <div style={styles.mktTvItemLabel}>Live Courts</div>
                <div style={styles.mktTvItemValue}>2</div>
              </div>
              <div>
                <div style={styles.mktTvItemLabel}>Scores</div>
                <div style={styles.mktTvItemValue}>11–7</div>
              </div>
              <div>
                <div style={styles.mktTvItemLabel}>Next Match</div>
                <div style={styles.mktTvItemValue}>Court 3</div>
              </div>
              <div>
                <div style={styles.mktTvItemLabel}>Standings</div>
                <div style={styles.mktTvItemValue}>Live</div>
              </div>
            </div>
          </div>
          <p style={{ ...styles.mktSectionSub, textAlign: "center", marginTop: 24 }}>
            Players always know where they stand and what's happening next.
          </p>
        </div>
      </section>

      <section id="tournaments" style={{ ...styles.mktSection, ...styles.mktSectionAlt }}>
        <div style={styles.mktSectionInner}>
          <div style={styles.mktSectionHead}>
            <div style={styles.mktSectionKicker}>Tournament mode</div>
            <h2 style={styles.mktSectionHeadline}>From Open Play to Tournament Day.</h2>
          </div>
          <div style={styles.mktPillRow}>
            {["Round Robin", "Double Elimination", "Brackets", "Quarterfinals", "Semifinals", "Finals", "Live Scoring", "Tournament History"].map((t) => (
              <span key={t} style={styles.mktPill}>
                <Trophy size={13} strokeWidth={2.5} style={{ verticalAlign: "-2px", marginRight: 5 }} />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section style={styles.mktSection}>
        <div style={styles.mktSectionInner}>
          <div style={styles.mktSectionHead}>
            <div style={styles.mktSectionKicker}>Player experience</div>
            <h2 style={styles.mktSectionHeadline}>Players Know What's Next.</h2>
          </div>
          <div style={styles.mktFlowRow}>
            {["Join the session", "Check in", "See queue position", "Get matched", "Play", "See score/history", "Continue rotating"].map((step, i) => (
              <div key={step} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={styles.mktFlowStep}>
                  <div style={styles.mktFlowNum}>{i + 1}</div>
                  <div style={styles.mktFlowText}>{step}</div>
                </div>
                {i < 6 && <ChevronRight size={16} style={{ color: "var(--color-text-faint)", flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="for-clubs" style={{ ...styles.mktSection, ...styles.mktSectionAlt }}>
        <div style={styles.mktSectionInner}>
          <div style={styles.mktSectionHead}>
            <div style={styles.mktSectionKicker}>For organizers &amp; clubs</div>
            <h2 style={styles.mktSectionHeadline}>Built for Organizers. Ready for Clubs.</h2>
          </div>
          <div style={styles.mktOrgGrid}>
            <div style={styles.mktOrgCard}>
              <div style={styles.mktOrgKicker}>For coaches, community organizers, clubs, recurring hosts</div>
              <h3 style={styles.mktOrgTitle}>Open Play Organizer</h3>
              <ul style={styles.mktOrgList}>
                <li style={styles.mktOrgListItem}><ChevronRight size={14} />Fast session setup</li>
                <li style={styles.mktOrgListItem}><ChevronRight size={14} />Automated rotation</li>
                <li style={styles.mktOrgListItem}><ChevronRight size={14} />Queue management</li>
                <li style={styles.mktOrgListItem}><ChevronRight size={14} />Live scoring</li>
                <li style={styles.mktOrgListItem}><ChevronRight size={14} />Player history</li>
              </ul>
              <button style={styles.mktBtnPrimaryOnLight} onClick={onCreate}>
                Start Free
              </button>
            </div>
            <div style={styles.mktOrgCard}>
              <div style={styles.mktOrgKicker}>For multi-court facilities, commercial venues, tournament organizers</div>
              <h3 style={styles.mktOrgTitle}>Pickleball Club</h3>
              <ul style={styles.mktOrgList}>
                <li style={styles.mktOrgListItem}><ChevronRight size={14} />Multiple courts</li>
                <li style={styles.mktOrgListItem}><ChevronRight size={14} />Open Play management</li>
                <li style={styles.mktOrgListItem}><ChevronRight size={14} />Player database</li>
                <li style={styles.mktOrgListItem}><ChevronRight size={14} />Tournament management</li>
                <li style={styles.mktOrgListItem}><ChevronRight size={14} />TV displays</li>
                <li style={styles.mktOrgListItem}><ChevronRight size={14} />Analytics</li>
              </ul>
              <button style={styles.mktBtnGhostOnLight} onClick={onAdmin}>
                Talk to Us
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" style={styles.mktSection}>
        <div style={styles.mktSectionInner}>
          <div style={styles.mktSectionHead}>
            <div style={styles.mktSectionKicker}>Pricing</div>
            <h2 style={styles.mktSectionHeadline}>Start Free</h2>
          </div>
          <div style={styles.mktPricingCard}>
            <div style={styles.mktPricingPrice}>Free to try</div>
            <p style={styles.mktSectionSub}>Try PickleKing with your first Open Play session.</p>
            <button style={{ ...styles.mktBtnPrimaryOnLight, margin: "18px auto 0 auto" }} onClick={onCreate}>
              <Plus size={16} strokeWidth={2.5} />
              Get Started
            </button>
            <p style={styles.mktPricingNote}>Plans for organizers and clubs are coming.</p>
          </div>
        </div>
      </section>

      <section style={styles.mktFinalCta}>
        <h2 style={styles.mktFinalTitle}>
          Your Open Play.
          <br />
          Smarter.
        </h2>
        <p style={styles.mktFinalSub}>Stop managing the queue. Start playing the game.</p>
        <div style={{ ...styles.mktHeroCtaRow, justifyContent: "center", marginBottom: 0 }}>
          <button style={styles.mktBtnPrimaryOnDark} onClick={onCreate}>
            <Plus size={16} strokeWidth={2.5} />
            Start Free
          </button>
          <button style={styles.mktBtnGhostOnDark} onClick={() => scrollTo("how-it-works")}>
            See PickleKing in Action
          </button>
        </div>
      </section>

      <Footer
        onAdmin={onAdmin}
        onDeveloper={onDeveloper}
        onTemplates={onTemplates}
        onPlayerPortal={onPlayerPortal}
        onLeagues={onLeagues}
        onPlayerManagement={onPlayerManagement}
        onVenueManagement={onVenueManagement}
        onCourtBooking={onCourtBooking}
        onRatings={onRatings}
        onTournamentHistory={onTournamentHistory}
        onSessionHistory={onSessionHistory}
        scrollTo={scrollTo}
      />
    </div>
  );
}

function Nav({ onCreate, onAdmin, scrollTo, mobileMenuOpen, setMobileMenuOpen }) {
  return (
    <header style={styles.mktNav}>
      <div style={styles.mktNavInner}>
        <button style={styles.mktLogo} onClick={() => scrollTo("top")} aria-label="PickleKing home">
          <span style={styles.mktLogoMark}>P</span>
          {APP_NAME}
        </button>
        <nav style={styles.mktNavLinks} className="mkt-nav-links">
          <button style={styles.mktNavLink} onClick={() => scrollTo("features")}>Features</button>
          <button style={styles.mktNavLink} onClick={() => scrollTo("how-it-works")}>How It Works</button>
          <button style={styles.mktNavLink} onClick={() => scrollTo("for-clubs")}>For Clubs</button>
          <button style={styles.mktNavLink} onClick={() => scrollTo("pricing")}>Pricing</button>
        </nav>
        <div style={styles.mktNavActions} className="mkt-nav-actions">
          <button style={styles.mktNavGhostBtn} onClick={onAdmin}>Sign In</button>
          <button style={styles.mktNavCta} onClick={onCreate}>Get Started</button>
        </div>
        <button
          style={styles.mktMobileMenuBtn}
          className="mkt-mobile-menu-btn"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      {mobileMenuOpen && (
        <div style={styles.mktMobileMenu}>
          <button style={styles.mktNavLink} onClick={() => scrollTo("features")}>Features</button>
          <button style={styles.mktNavLink} onClick={() => scrollTo("how-it-works")}>How It Works</button>
          <button style={styles.mktNavLink} onClick={() => scrollTo("for-clubs")}>For Clubs</button>
          <button style={styles.mktNavLink} onClick={() => scrollTo("pricing")}>Pricing</button>
          <button style={styles.mktNavGhostBtn} onClick={onAdmin}>Sign In</button>
          <button style={styles.mktNavCta} onClick={onCreate}>Get Started</button>
        </div>
      )}
    </header>
  );
}

function Hero({ onCreate, scrollTo, joinOpen, setJoinOpen, joinCode, setJoinCode, handleJoin, joinError, joining }) {
  return (
    <section id="top" style={styles.mktHero}>
      <div style={styles.mktHeroInner} className="mkt-hero-inner">
        <div>
          <div style={styles.mktHeroKicker}>
            <Zap size={12} strokeWidth={2.5} />
            PickleKing · The Smart Open Play Operating System
          </div>
          <h1 style={styles.mktHeroTitle}>Run Open Play Without the Chaos.</h1>
          <p style={styles.mktHeroSub}>
            PickleKing automatically manages your queue, rotations, courts and scores — so players know when they're
            playing and organizers don't have to.
          </p>
          <div style={styles.mktHeroCtaRow}>
            <button style={styles.mktBtnPrimaryOnDark} onClick={onCreate}>
              <Plus size={16} strokeWidth={2.5} />
              Start Free
            </button>
            <button style={styles.mktBtnGhostOnDark} onClick={() => scrollTo("how-it-works")}>
              See How It Works
            </button>
          </div>
          <p style={styles.mktHeroTaglineRow}>Fair rotations. Smart queues. Live courts. Better Open Play.</p>

          <div style={{ marginTop: 22 }}>
            {!joinOpen ? (
              <button style={{ ...styles.mktNavLink, color: "rgba(243,241,228,0.75)" }} onClick={() => setJoinOpen(true)}>
                Already have a session code? Join here →
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  style={{ ...styles.input, ...styles.codeInput, maxWidth: 140 }}
                  placeholder="ABC123"
                  value={joinCode}
                  maxLength={6}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  aria-label="Session code"
                />
                <button
                  style={{ ...styles.mktBtnPrimaryOnDark, padding: "10px 18px", fontSize: 13, ...(joining ? styles.btnDisabled : {}) }}
                  onClick={handleJoin}
                  disabled={joining}
                >
                  <LogIn size={14} strokeWidth={2.5} />
                  {joining ? "Joining…" : "Join"}
                </button>
              </div>
            )}
            {joinError && <div style={{ ...styles.pinError, marginTop: 8 }}>{joinError}</div>}
          </div>
        </div>

        <div>
          <ProductMockup />
        </div>
      </div>
    </section>
  );
}

function ProductMockup() {
  return (
    <div style={styles.mktMockupFrame}>
      <div style={styles.mktMockupChrome}>
        <span style={styles.mktMockupDot("#ED6A5E")} />
        <span style={styles.mktMockupDot("#F4BF4F")} />
        <span style={styles.mktMockupDot("#61C454")} />
      </div>
      <div style={styles.mktMockupBody}>
        <div style={styles.mktMockupLabel}>Live Courts</div>
        <div style={styles.mktMockupCourtRow}>
          <span style={styles.mktMockupCourtName}>Court 1</span>
          <span style={styles.mktMockupLivePill}>● LIVE</span>
          <span style={styles.mktMockupScore}>11–7</span>
        </div>
        <div style={styles.mktMockupCourtRow}>
          <span style={styles.mktMockupCourtName}>Court 2</span>
          <span style={styles.mktMockupLivePill}>● LIVE</span>
          <span style={styles.mktMockupScore}>6–4</span>
        </div>

        <div style={styles.mktMockupNextCard}>
          <div style={styles.mktMockupLabel}>Next Match</div>
          <div style={styles.mktMockupNextTeams}>
            Guil + Jovy
            <br />
            vs
            <br />
            Emitz + Gab
          </div>
        </div>

        <div style={styles.mktMockupLabel}>Queue</div>
        <div style={styles.mktMockupQueueRow}><span>1. John</span><span style={{ color: "var(--color-text-faint)" }}>Waiting</span></div>
        <div style={styles.mktMockupQueueRow}><span>2. Melit</span><span style={{ color: "var(--color-text-faint)" }}>Waiting</span></div>
        <div style={{ ...styles.mktMockupQueueRow, borderBottom: "none" }}><span>3. Zee</span><span style={{ color: "var(--color-text-faint)" }}>Waiting</span></div>
      </div>
    </div>
  );
}

function TrustStrip() {
  return (
    <div style={styles.mktTrustStrip}>
      <div style={styles.mktTrustInner}>
        <div style={styles.mktTrustLead}>Built for the way real Open Play actually works.</div>
        {["Fair Rotation", "Smart Queue", "Live Courts", "Live Scoring", "Tournament Ready"].map((t) => (
          <div key={t} style={styles.mktTrustItem}>
            <Zap size={13} strokeWidth={2.5} style={{ color: "var(--color-secondary-text)" }} />
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, text }) {
  return (
    <div style={styles.mktFeatureCard}>
      <div style={styles.mktFeatureIcon}>{icon}</div>
      <h3 style={styles.mktFeatureTitle}>{title}</h3>
      <p style={styles.mktFeatureText}>{text}</p>
    </div>
  );
}

function CourtMini({ name, status, value }) {
  return (
    <div style={styles.mktCourtMini}>
      <div style={styles.mktCourtMiniName}>{name}</div>
      <span style={styles.mktCourtMiniBadge(status)}>{value}</span>
    </div>
  );
}

function Footer({
  onAdmin,
  onDeveloper,
  onTemplates,
  onPlayerPortal,
  onLeagues,
  onPlayerManagement,
  onVenueManagement,
  onCourtBooking,
  onRatings,
  onTournamentHistory,
  onSessionHistory,
  scrollTo,
}) {
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <>
      <footer style={styles.mktFooter}>
        <div style={styles.mktFooterInner}>
          <div>
            <div style={styles.mktFooterBrand}>{APP_NAME}</div>
            <div style={styles.mktFooterTagline}>The Smart Open Play Operating System</div>
          </div>
          <div style={styles.mktFooterCol}>
            <div style={styles.mktFooterColTitle}>Product</div>
            <button style={styles.mktFooterLink} onClick={() => scrollTo("features")}>Features</button>
            <button style={styles.mktFooterLink} onClick={() => scrollTo("pricing")}>Pricing</button>
          </div>
          <div style={styles.mktFooterCol}>
            <div style={styles.mktFooterColTitle}>Company</div>
            <button style={styles.mktFooterLink} onClick={onAdmin}>Contact</button>
            <button style={styles.mktFooterLink} onClick={onAdmin}>Privacy</button>
            <button style={styles.mktFooterLink} onClick={onAdmin}>Terms</button>
          </div>
        </div>
        <div style={styles.mktFooterBottom}>
          <span>{FOOTER_TEXT}</span>
          <span>© {new Date().getFullYear()} {APP_NAME}</span>
        </div>
      </footer>

      <div style={styles.mktToolsWrap}>
        <button style={styles.mktToolsToggle} onClick={() => setToolsOpen((v) => !v)} aria-expanded={toolsOpen}>
          <ChevronDown size={14} style={{ transform: toolsOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          Organizer &amp; Admin Tools
        </button>
        {toolsOpen && (
          <div style={styles.mktToolsGrid}>
            <button style={styles.mktToolsLink} onClick={onAdmin}>Organizer: Manage access codes →</button>
            <button style={styles.mktToolsLink} onClick={onTemplates}>Manage tournament templates →</button>
            <button style={styles.mktToolsLink} onClick={onPlayerPortal}>Player Portal →</button>
            <button style={styles.mktToolsLink} onClick={onLeagues}>Manage leagues →</button>
            <button style={styles.mktToolsLink} onClick={onPlayerManagement}>Manage players →</button>
            <button style={styles.mktToolsLink} onClick={onVenueManagement}>Venue management →</button>
            <button style={styles.mktToolsLink} onClick={onCourtBooking}>Court booking &amp; reservations →</button>
            <button style={styles.mktToolsLink} onClick={onRatings}>View club rankings →</button>
            <button style={styles.mktToolsLink} onClick={onTournamentHistory}>View tournament history →</button>
            <button style={styles.mktToolsLink} onClick={onSessionHistory}>View all sessions →</button>
            <button style={styles.mktToolsLink} onClick={onDeveloper}>Developer: rotation simulator →</button>
          </div>
        )}
      </div>
    </>
  );
}
