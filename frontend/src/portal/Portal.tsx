import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

const API_BASE = String(
  (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env
    .VITE_API_BASE_URL ?? ""
).trim().replace(/\/+$/, "");

type Data = Record<string, any>;

async function api<T = Data>(
  path: string,
  options: RequestInit = {},
  csrf = ""
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (csrf) headers.set("x-csrf-token", csrf);

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || body.message || `Request failed (${response.status})`);
  }
  return body as T;
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

function items(data: any, key: string): Data[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  return [];
}

function label(value: unknown): string {
  return String(value ?? "").replaceAll("_", " ");
}

function Page({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="dy-page">
      <header className="site-header">
  <a href="/" className="site-brand"><span className="site-mark">dy</span><span>DIGITAL<br />YOUTH</span></a>
  <nav aria-label="Main navigation">
    <a href="/">Home</a>
    <a href="/business/intake">Business</a>
    <a href="/participant">Youth</a>
    <a href="/coordinator">Coordinator</a>
  </nav>
  <span className="site-online"><span></span> Pilot platform</span>
</header>
      <main className="dy-main">
        <div className="dy-heading">
          <p className="dy-eyebrow">DIGITAL YOUTH PILOT</p>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {children}
      </main>
      <footer className="dy-footer">
        Nusa Lembongan · Bengaluru · Youth-led digital solutions
      </footer>
    </div>
  );
}

function Notice({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return (
    <p className={error ? "dy-notice dy-error" : "dy-notice dy-success"} role="status">
      {error || success}
    </p>
  );
}

function LoginForm({
  participant,
  onLogin
}: {
  participant: boolean;
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLogin(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="dy-card dy-form" onSubmit={submit}>
      <h2>{participant ? "Participant sign in" : "Coordinator sign in"}</h2>
      <label>Email<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <Notice error={error} />
      <button className="dy-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

function ParticipantPortal() {
  const [user, setUser] = useState<Data | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [csrf, setCsrf] = useState("");
  const [tab, setTab] = useState("overview");
  const [projects, setProjects] = useState<Data[]>([]);
  const [modules, setModules] = useState<Data[]>([]);
  const [enrollments, setEnrollments] = useState<Data[]>([]);
  const [profile, setProfile] = useState<Data>({});
  const [portfolio, setPortfolio] = useState<Data[]>([]);
  const [skills, setSkills] = useState<Data[]>([]);
  const [interests, setInterests] = useState<Data[]>([]);
  const [submissions, setSubmissions] = useState<Data[]>([]);
  const [timeLogs, setTimeLogs] = useState<Data[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [workDescription, setWorkDescription] = useState("");
  const [deliverableTitle, setDeliverableTitle] = useState("");
  const [deliverableDescription, setDeliverableDescription] = useState("");

  async function refresh() {
    const results = await Promise.allSettled([
      api("/api/projects"),
      api("/api/learning/modules"),
      api("/api/learning/enrollments"),
      api("/api/participants/profile"),
      api("/api/participants/portfolio"),
      api("/api/participants/skills"),
      api("/api/participants/interests"),
      api("/api/learning/submissions"),
      api("/api/learning/time-logs")
    ]);
    if (results[0].status === "fulfilled") setProjects(items(results[0].value, "projects"));
    if (results[1].status === "fulfilled") setModules(items(results[1].value, "modules"));
    if (results[2].status === "fulfilled") setEnrollments(items(results[2].value, "enrollments"));
    if (results[3].status === "fulfilled") setProfile((results[3] as any).value.profile ?? (results[3] as any).value);
    if (results[4].status === "fulfilled") setPortfolio(items(results[4].value, "items"));
    if (results[5].status === "fulfilled") setSkills(items(results[5].value, "skills"));
    if (results[6].status === "fulfilled") setInterests(items(results[6].value, "interests"));
    if (results[7].status === "fulfilled") setSubmissions(items(results[7].value, "submissions"));
    if (results[8].status === "fulfilled") setTimeLogs(items(results[8].value, "timeLogs"));
    const failed = results.filter(result => result.status === "rejected");
    if (failed.length) setError(failed.length === results.length
      ? "Could not load your workspace. Check your connection and sign in again."
      : "Some workspace information could not be loaded. Use Refresh to try again.");
    else setError("");
  }

  useEffect(() => {
    void (async () => {
      try {
        const session = await api<Data>("/api/participants/me");
        if (session.authenticated) {
          const token = await api<Data>("/api/participants/csrf");
          if (!token.csrfToken) throw new Error("Participant session is unavailable.");
          setCsrf(token.csrfToken ?? "");
          setUser(session.participant ?? session.user ?? session);
        }
      } catch {
        // A visitor without a participant session sees the login screen.
      } finally {
        setCheckingSession(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (user) void refresh();
  }, [user]);

  async function login(email: string, password: string) {
    const result = await api<Data>("/api/participants/login", {
      method: "POST",
      body: jsonBody({ email, password })
    });
    setCsrf(result.csrfToken ?? "");
    setUser(result.participant ?? result.user ?? result);
    setError("");
  }

  async function logout() {
    try {
      await api("/api/participants/logout", { method: "POST" }, csrf);
    } finally {
      setUser(null);
      setCsrf("");
    }
  }

  async function act(action: () => Promise<any>, message: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(message);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (checkingSession) {
    return (
      <Page title="Participant workspace" subtitle="Sign in to access your learning, projects and portfolio.">
        <div className="dy-card" role="status">Checking participant session…</div>
      </Page>
    );
  }

  if (!user) {
    return (
      <Page title="Participant workspace" subtitle="Sign in to access your learning, projects and portfolio.">
        <LoginForm participant onLogin={login} />
        <InvitationRegistration onRegistered={() => window.location.reload()} />
      </Page>
    );
  }

  return (
    <Page
      title={`Welcome, ${profile.display_name ?? user.displayName ?? user.display_name ?? "participant"}`}
      subtitle="Your learning, project work and verified experience."
    >
      <div className="dy-toolbar">
        <div className="dy-tabs">
          {["overview", "projects", "learning", "profile"].map(value => (
            <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>
              {label(value)}
            </button>
          ))}
        </div>
        <button className="dy-button dy-button-light" onClick={() => void logout()}>Sign out</button>
      </div>
      <Notice error={error} success={success} />

      {tab === "overview" && (
        <section className="dy-grid">
          <article className="dy-card">
            <p className="dy-eyebrow">YOUR PROJECTS</p>
            <h2>{projects.length}</h2>
            <p>Assignments and active project work.</p>
            <button className="dy-text-button" onClick={() => setTab("projects")}>Open projects →</button>
          </article>
          <article className="dy-card">
            <p className="dy-eyebrow">LEARNING</p>
            <h2>{enrollments.length}</h2>
            <p>Learning modules you have enrolled in.</p>
            <button className="dy-text-button" onClick={() => setTab("learning")}>Open learning →</button>
          </article>
          <article className="dy-card">
            <p className="dy-eyebrow">PORTFOLIO</p>
            <h2>{portfolio.length}</h2>
            <p>Projects and work samples in your portfolio.</p>
            <button className="dy-text-button" onClick={() => setTab("profile")}>View profile →</button>
          </article>
        </section>
      )}

      {tab === "projects" && (
        <section className="dy-stack">
          {projects.length === 0 && <div className="dy-card">No project assignments yet. New invitations will appear here.</div>}
          {projects.map(project => (
            <article className="dy-card" key={project.id}>
              <div className="dy-card-head">
                <div>
                  <p className="dy-eyebrow">{project.project_code ?? "PROJECT"}</p>
                  <h2>{project.title}</h2>
                </div>
                <span className="dy-status">{label(project.project_status ?? project.assignment_status)}</span>
              </div>
              <p>{project.objective}</p>
              <p className="dy-muted">{project.business_name} · {project.pilot_site}</p>
              {project.assignment_status === "invited" && (
                <div className="dy-actions">
                  <button className="dy-button" disabled={busy} onClick={() => void act(
                    () => api(`/api/projects/${project.id}/assignments/${project.assignment_id}/respond`, {
                      method: "POST", body: jsonBody({ response: "accepted" })
                    }, csrf),
                    "Project assignment accepted."
                  )}>Accept assignment</button>
                  <button className="dy-button dy-button-light" disabled={busy} onClick={() => void act(
                    () => api(`/api/projects/${project.id}/assignments/${project.assignment_id}/respond`, {
                      method: "POST", body: jsonBody({ response: "declined" })
                    }, csrf),
                    "Assignment declined."
                  )}>Decline</button>
                </div>
              )}
              {project.assignment_status === "accepted" && (
                <div className="dy-subpanel">
                  <h3>Record commercial work</h3>
                  <div className="dy-inline">
                    <label>Minutes<input type="number" min="1" max="1440" value={minutes} onChange={e => setMinutes(e.target.value)} /></label>
                    <label className="dy-grow">Work description<input value={workDescription} onChange={e => setWorkDescription(e.target.value)} placeholder="Describe the work completed" /></label>
                  </div>
                  <button className="dy-button" disabled={busy || !workDescription.trim()} onClick={() => void act(
                    () => api(`/api/projects/${project.id}/work-logs`, {
                      method: "POST",
                      body: jsonBody({
                        workDate: new Date().toISOString().slice(0, 10),
                        minutesWorked: Number(minutes),
                        workType: ["demonstration", "business_review", "agreement_pending"].includes(project.project_status) ? "demonstration" : "commercial",
                        description: workDescription
                      })
                    }, csrf),
                    "Work log submitted for review."
                  )}>Log time</button>

                  <h3>Submit a deliverable</h3>
                  <label>Title<input value={deliverableTitle} onChange={e => setDeliverableTitle(e.target.value)} placeholder="Deliverable title" /></label>
                  <label>Description<textarea rows={3} value={deliverableDescription} onChange={e => setDeliverableDescription(e.target.value)} placeholder="What did you deliver? " /></label>
                  <button className="dy-button" disabled={busy || deliverableTitle.trim().length < 3 || deliverableDescription.trim().length < 5} onClick={() => void act(
                    () => api(`/api/projects/${project.id}/deliverables`, {
                      method: "POST",
                      body: jsonBody({ title: deliverableTitle, description: deliverableDescription })
                    }, csrf),
                    "Deliverable submitted."
                  )}>Submit deliverable</button>
                  <button className="dy-button dy-button-danger" disabled={busy} onClick={() => {
                    const reason = window.prompt("Describe the issue or disagreement (at least 10 characters):");
                    if (reason && reason.trim().length >= 10) void act(
                      () => api(`/api/projects/${project.id}/disputes`, { method: "POST", body: jsonBody({ reason }) }, csrf),
                      "Dispute submitted to the coordinator."
                    );
                  }}>Raise a project dispute</button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {tab === "learning" && (
        <LearningPanel
          modules={modules}
          enrollments={enrollments}
          submissions={submissions}
          timeLogs={timeLogs}
          csrf={csrf}
          onRefresh={refresh}
          onError={setError}
          onSuccess={setSuccess}
        />
      )}

      {tab === "profile" && (
        <ProfilePanel
          profile={profile}
          csrf={csrf}
          portfolio={portfolio}
          onSaved={refresh}
          onError={setError}
          onSuccess={setSuccess}
        />
      )}
      <ParticipantGrowthPanel
        skills={skills}
        interests={interests}
        portfolio={portfolio}
        csrf={csrf}
        onSaved={refresh}
        onError={setError}
        onSuccess={setSuccess}
      />

    </Page>
  );
}


function InvitationRegistration({ onRegistered }: { onRegistered: () => void }) {
  const invitationParams = new URLSearchParams(window.location.search);
  const invitationFromLink = invitationParams.get("invite") ?? invitationParams.get("token") ?? "";
  const [open, setOpen] = useState(Boolean(invitationFromLink));
  const [token, setToken] = useState(invitationFromLink);
  const [password, setPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [workingModel, setWorkingModel] = useState("both");
  const [about, setAbout] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: { preventDefault(): void }) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/participants/accept-invitation", {
        method: "POST",
        body: jsonBody({
          token: token.trim(),
          password,
          dateOfBirth,
          adultParticipationConfirmed: true,
          phone: phone || null,
          workingModel,
          about: about || null
        })
      });
      onRegistered();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invitation registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dy-card dy-form">
      <button type="button" className="dy-text-button" onClick={() => setOpen(v => !v)}>
        {open ? "Hide invitation registration" : "Have a participant invitation' Register here →"}
      </button>
      {open && (
        <form onSubmit={submit} className="dy-stack">
          <h2>Accept your invitation</h2>
          <label>Invitation token
            <input required minLength={32} value={token} onChange={e => setToken(e.target.value)} />
          </label>
          <label>Password (at least 12 characters)
            <input type="password" required minLength={12} value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          <label>Date of birth
            <input type="date" required value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} />
          </label>
          <label>Phone (optional)
            <input value={phone} onChange={e => setPhone(e.target.value)} />
          </label>
          <label>Working model
            <select value={workingModel} onChange={e => setWorkingModel(e.target.value)}>
              <option value="individual">Individual</option>
              <option value="collaborative">Collaborative</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label>About you (optional)
            <textarea rows={2} value={about} onChange={e => setAbout(e.target.value)} />
          </label>
          <p className="dy-muted">You must be at least 18 years old to participate.</p>
          {error && <p className="dy-error">{error}</p>}
          <button className="dy-button" disabled={busy}>
            {busy ? "Registering…" : "Accept invitation"}
          </button>
        </form>
      )}
    </section>
  );
}

function LearningPanel({
  modules, enrollments, submissions, timeLogs, csrf,
  onRefresh, onError, onSuccess
}: {
  modules: Data[];
  enrollments: Data[];
  submissions: Data[];
  timeLogs: Data[];
  csrf: string;
  onRefresh: () => Promise<void>;
  onError: (value: string) => void;
  onSuccess: (value: string) => void;
}) {
  const [details, setDetails] = useState<Record<string, Data>>({});
  const [expanded, setExpanded] = useState("");
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [minutes, setMinutes] = useState("30");
  const [activity, setActivity] = useState("training");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<any>, message: string) {
    setBusy(true);
    onError("");
    onSuccess("");
    try {
      await action();
      onSuccess(message);
      await onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Learning action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function openModule(module: Data) {
    const key = String(module.id);
    if (details[key]) {
      setExpanded(expanded === key ? "" : key);
      return;
    }
    try {
      const result = await api<Data>("/api/learning/modules/" + encodeURIComponent(module.slug));
      setDetails(old => ({ ...old, [key]: result }));
      setExpanded(key);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not load module.");
    }
  }

  function exercises(moduleId: string): Data[] {
    const detail = details[moduleId];
    if (Array.isArray(detail?.exercises)) return detail.exercises;
    if (Array.isArray(detail?.module?.exercises)) return detail.module.exercises;
    return [];
  }

  return (
    <section className="dy-stack">
      <h2>Published learning modules</h2>
      {modules.length === 0 && <div className="dy-card">No published modules are available yet.</div>}
      {modules.map(module => {
        const enrollment = enrollments.find(e => Number(e.module_id) === Number(module.id));
        const key = String(module.id);
        const detail = details[key];

        return (
          <article className="dy-card" key={module.id}>
            <h2>{module.title}</h2>
            <p>{module.summary}</p>
            <p className="dy-muted">{module.skill_category} · {module.estimated_minutes} minutes</p>
            {!enrollment ? (
              <button className="dy-button" disabled={busy} onClick={() => void run(
                () => api("/api/learning/modules/" + module.id + "/enroll", {
                  method: "POST", body: "{}"
                }, csrf),
                "You are enrolled in this module."
              )}>Enrol in module</button>
            ) : (
              <>
                <p className="dy-success-text">Enrolled · {label(enrollment.enrollment_status)}</p>
                <button className="dy-button dy-button-light" onClick={() => void openModule(module)}>
                  {expanded === key ? "Hide exercises" : "View lesson and exercises"}
                </button>
              </>
            )}
            {expanded === key && detail && (
              <div className="dy-subpanel">
                <h3>Lesson</h3>
                <p>{detail.module?.content_markdown ?? detail.content_markdown ?? module.summary}</p>
                <h3>Exercises</h3>
                {exercises(key).map(exercise => (
                  <div className="dy-list-row" key={exercise.id}>
                    <h3>{exercise.title}</h3>
                    <p>{exercise.instructions}</p>
                    <label>Your response
                      <textarea rows={4} value={responses[String(exercise.id)] ?? ""}
                        onChange={e => setResponses(old => ({ ...old, [exercise.id]: e.target.value }))} />
                    </label>
                    <label>Evidence URL (optional)
                      <input type="url" value={urls[String(exercise.id)] ?? ""}
                        onChange={e => setUrls(old => ({ ...old, [exercise.id]: e.target.value }))} />
                    </label>
                    <button className="dy-button"
                      disabled={busy || (responses[String(exercise.id)] ?? "").trim().length < 5}
                      onClick={() => void run(
                        () => api("/api/learning/exercises/" + exercise.id + "/submissions", {
                          method: "POST",
                          body: jsonBody({
                            responseText: responses[String(exercise.id)],
                            resourceUrl: urls[String(exercise.id)] || null
                          })
                        }, csrf),
                        "Exercise submitted for review."
                      )}>Submit exercise</button>
                  </div>
                ))}
                {exercises(key).length === 0 && <p>No exercises are available in this module.</p>}
              </div>
            )}
          </article>
        );
      })}

      <article className="dy-card dy-form">
        <h2>Log learning or practice time</h2>
        <label>Module
          <select id="learning-time-module">
            <option value="">General learning</option>
            {enrollments.map(e => (
              <option key={e.module_id} value={e.module_id}>
                {e.module_title ?? e.title ?? ("Module " + e.module_id)}
              </option>
            ))}
          </select>
        </label>
        <label>Activity
          <select value={activity} onChange={e => setActivity(e.target.value)}>
            <option value="training">Training</option>
            <option value="practice">Practice</option>
          </select>
        </label>
        <label>Minutes
          <input type="number" min="1" max="1440" value={minutes} onChange={e => setMinutes(e.target.value)} />
        </label>
        <label>Description
          <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        </label>
        <button className="dy-button" disabled={busy || Number(minutes) < 1 || description.trim().length < 5}
          onClick={() => {
            const select = document.getElementById("learning-time-module") as HTMLSelectElement | null;
            void run(
              () => api("/api/learning/time-logs", {
                method: "POST",
                body: jsonBody({
                  moduleId: select?.value ? Number(select.value) : null,
                  workDate: new Date().toISOString().slice(0, 10),
                  minutesSpent: Number(minutes),
                  activityType: activity,
                  description
                })
              }, csrf),
              "Learning time submitted for review."
            );
          }}>Submit time log</button>
      </article>

      <article className="dy-card">
        <h2>Exercise submissions</h2>
        {submissions.map(row => (
          <div className="dy-list-row" key={row.id}>
            <strong>{row.module_title} · {row.exercise_title}</strong>
            <p>{row.response_text}</p>
            <span className="dy-status">{label(row.review_status)}</span>
            {row.feedback && <p>{row.feedback}</p>}
          </div>
        ))}
        {submissions.length === 0 && <p>No submissions yet.</p>}
      </article>

      <article className="dy-card">
        <h2>Learning time history</h2>
        {timeLogs.map(row => (
          <div className="dy-list-row" key={row.id}>
            <strong>{row.module_title ?? "General learning"} · {row.minutes_spent} minutes</strong>
            <p>{row.description}</p>
            <span className="dy-status">{label(row.approval_status)}</span>
          </div>
        ))}
        {timeLogs.length === 0 && <p>No time logs yet.</p>}
      </article>
    </section>
  );
}

function ParticipantGrowthPanel({
  skills, interests, portfolio, csrf, onSaved, onError, onSuccess
}: {
  skills: Data[];
  interests: Data[];
  portfolio: Data[];
  csrf: string;
  onSaved: () => Promise<void>;
  onError: (value: string) => void;
  onSuccess: (value: string) => void;
}) {
  const [skill, setSkill] = useState("");
  const [level, setLevel] = useState("beginner");
  const [evidence, setEvidence] = useState("");
  const [interestText, setInterestText] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [itemType, setItemType] = useState("project");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setInterestText(interests.map(i => i.interest).join(", "));
  }, [interests]);

  async function run(action: () => Promise<any>, message: string) {
    setBusy(true);
    onError("");
    onSuccess("");
    try {
      await action();
      onSuccess(message);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSkill() {
    const next = [
      ...skills.map(v => ({
        skillName: v.skill_name,
        proficiency: v.proficiency,
        evidenceNotes: v.evidence_notes
      })),
      { skillName: skill.trim(), proficiency: level, evidenceNotes: evidence || null }
    ];
    await run(() => api("/api/participants/skills", {
      method: "PUT", body: jsonBody({ items: next })
    }, csrf), "Skills saved.");
    setSkill("");
    setEvidence("");
  }

  async function saveInterests() {
    const next = interestText.split(",").map(v => v.trim()).filter(Boolean);
    await run(() => api("/api/participants/interests", {
      method: "PUT", body: jsonBody({ items: next })
    }, csrf), "Interests saved.");
  }

  async function savePortfolio(event: { preventDefault(): void }) {
    event.preventDefault();
    await run(() => api("/api/participants/portfolio", {
      method: "POST",
      body: jsonBody({
        title, description, itemType,
        externalUrl: url || null,
        visibility: "coordinators"
      })
    }, csrf), "Portfolio item created.");
    setTitle("");
    setDescription("");
    setUrl("");
  }

  return (
    <div className="dy-stack">
      <section className="dy-card dy-form">
        <h2>Skills</h2>
        {skills.map(v => (
          <div className="dy-list-row" key={v.id}>
            <strong>{v.skill_name}</strong> · {label(v.proficiency)}
            {v.verified_at && <span className="dy-success-text"> · Verified</span>}
            {v.evidence_notes && <p>{v.evidence_notes}</p>}
          </div>
        ))}
        <label>New skill<input value={skill} onChange={e => setSkill(e.target.value)} /></label>
        <label>Proficiency
          <select value={level} onChange={e => setLevel(e.target.value)}>
            <option value="beginner">Beginner</option>
            <option value="developing">Developing</option>
            <option value="competent">Competent</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <label>Evidence notes (optional)
          <textarea rows={2} value={evidence} onChange={e => setEvidence(e.target.value)} />
        </label>
        <button className="dy-button" disabled={busy || !skill.trim()} onClick={() => void saveSkill()}>
          Save skill
        </button>
      </section>

      <section className="dy-card dy-form">
        <h2>Interests</h2>
        <label>Comma-separated interests
          <textarea rows={3} value={interestText} onChange={e => setInterestText(e.target.value)} />
        </label>
        <button className="dy-button" disabled={busy} onClick={() => void saveInterests()}>
          Save interests
        </button>
      </section>

      <section className="dy-card dy-form">
        <h2>Talent portfolio</h2>
        <form onSubmit={savePortfolio} className="dy-stack">
          <label>Title<input required value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label>Description
            <textarea required rows={3} value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          <label>Type
            <select value={itemType} onChange={e => setItemType(e.target.value)}>
              <option value="exercise">Exercise</option>
              <option value="demonstration">Demonstration</option>
              <option value="project">Project</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>Evidence URL (optional)<input type="url" value={url} onChange={e => setUrl(e.target.value)} /></label>
          <button className="dy-button" disabled={busy}>Add portfolio item</button>
        </form>
        {portfolio.map(item => (
          <div className="dy-list-row" key={item.id}>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
            <small>{label(item.item_type)} · {label(item.visibility)}</small>
            {item.external_url && <p><a href={item.external_url} target="_blank" rel="noreferrer">Open evidence</a></p>}
            <button className="dy-button dy-button-light" disabled={busy}
              onClick={() => {
                if (window.confirm("Delete this portfolio item? ")) void run(
                  () => api("/api/participants/portfolio/" + item.id, { method: "DELETE" }, csrf),
                  "Portfolio item deleted."
                );
              }}>Delete item</button>
          </div>
        ))}
      </section>
    </div>
  );
}

function ProfilePanel({
  profile,
  csrf,
  portfolio,
  onSaved,
  onError,
  onSuccess
}: {
  profile: Data;
  csrf: string;
  portfolio: Data[];
  onSaved: () => Promise<void>;
  onError: (value: string) => void;
  onSuccess: (value: string) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [about, setAbout] = useState(profile.about ?? "");
  const [workingModel, setWorkingModel] = useState(profile.working_model ?? "both");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDisplayName(profile.display_name ?? "");
    setPhone(profile.phone ?? "");
    setAbout(profile.about ?? "");
    setWorkingModel(profile.working_model ?? "both");
  }, [profile]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    onError("");
    try {
      await api("/api/participants/profile", {
        method: "PATCH",
        body: jsonBody({ displayName, phone, about, workingModel })
      }, csrf);
      onSuccess("Profile saved.");
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dy-stack">
      <form className="dy-card dy-form" onSubmit={save}>
        <h2>Participant profile</h2>
        <label>Display name<input required value={displayName} onChange={e => setDisplayName(e.target.value)} /></label>
        <label>Phone<input value={phone} onChange={e => setPhone(e.target.value)} /></label>
        <label>About you<textarea rows={4} value={about} onChange={e => setAbout(e.target.value)} /></label>
        <label>Preferred working model
          <select value={workingModel} onChange={e => setWorkingModel(e.target.value)}>
            <option value="individual">Individual</option>
            <option value="collaborative">Team</option>
            <option value="both">Both</option>
          </select>
        </label>
        <button className="dy-button" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
      </form>
      <section className="dy-card">
        <h2>Portfolio</h2>
        {portfolio.length === 0 ? <p>No portfolio items yet.</p> : portfolio.map(item => (
          <div className="dy-list-row" key={item.id}>
            <strong>{item.title}</strong>
            <span>{item.description}</span>
            <small>{label(item.item_type)} · {label(item.visibility)}</small>
          </div>
        ))}
      </section>
    </div>
  );
}

function DiagnosticCard({
  diagnostic,
  csrf,
  onRefresh
}: {
  diagnostic: Data;
  csrf: string;
  onRefresh: () => Promise<void>;
}) {
  const [criteria, setCriteria] = useState({
    usefulness: false,
    solvable: false,
    safeToDeliver: false,
    measurable: false,
    skillsAvailable: false
  });
  const [rationale, setRationale] = useState("The problem has been assessed against all five pilot prioritisation criteria.");
  const [priority, setPriority] = useState("normal");
  const [title, setTitle] = useState(`Pilot solution for ${diagnostic.business_name ?? "business"}`);
  const [objective, setObjective] = useState("Address the business problem through a small, verifiable digital solution.");
  const [solution, setSolution] = useState("Develop and test a scoped solution using simulated materials before commercial work.");
  const [decision, setDecision] = useState("prioritised");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function assess() {
    setError("");
    try {
      await api(`/api/admin/diagnostics/${diagnostic.id}/prioritisation`, {
        method: "POST",
        body: jsonBody({ ...criteria, decision, rationale, priority })
      }, csrf);
      setSaved(decision === "prioritised");
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Prioritisation failed.");
    }
  }

  async function createProject() {
    setError("");
    try {
      await api("/api/admin/projects", {
        method: "POST",
        body: jsonBody({
          diagnosticSubmissionId: Number(diagnostic.id),
          title,
          objective,
          proposedSolution: solution
        })
      }, csrf);
      setSaved(false);
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Project creation failed.");
    }
  }

  return (
    <article className="dy-card">
      <p className="dy-eyebrow">{diagnostic.pilot_site ?? "PILOT DIAGNOSTIC"} · {label(diagnostic.priority)}</p>
      <h2>{diagnostic.business_name ?? diagnostic.businessName}</h2>
      <p>{diagnostic.biggest_operational_pain ?? diagnostic.biggestOperationalPain}</p>
      <p className="dy-muted">Status: {label(diagnostic.review_status)} · {label(diagnostic.business_type)}</p>
      {diagnostic.review_status !== "matched" && diagnostic.review_status !== "resolved" && (
        <>
          <h3>Human assessment</h3>
          <p className="dy-muted">Mark each criterion only after a coordinator has assessed the evidence.</p>
          <div className="dy-checks">
            {([
              ["usefulness", "Useful to the business"],
              ["solvable", "Solvable with available resources"],
              ["safeToDeliver", "Safe to deliver"],
              ["measurable", "Measurable outcome"],
              ["skillsAvailable", "Skills are available"]
            ] as const).map(([key, text]) => (
              <label key={key} className="dy-check">
                <input type="checkbox" checked={criteria[key]} onChange={e => setCriteria(old => ({ ...old, [key]: e.target.checked }))} />
                {text}
              </label>
            ))}
          </div>
          <label>Decision
            <select value={decision} onChange={e => setDecision(e.target.value)}>
              <option value="prioritised">Prioritise</option>
              <option value="deferred">Defer</option>
              <option value="rejected">Reject</option>
            </select>
          </label>
          <label>Rationale<textarea rows={3} value={rationale} onChange={e => setRationale(e.target.value)} /></label>
          <label>Priority
            <select value={priority} onChange={e => setPriority(e.target.value)}>
              <option value="low">Low</option><option value="normal">Normal</option>
              <option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </label>
          <button className="dy-button" style={{ marginTop: "16px" }} onClick={() => void assess()}>Save human assessment</button>
          {saved && (
            <div className="dy-subpanel">
              <h3>Create a project from this diagnostic</h3>
              <label>Project title<input value={title} onChange={e => setTitle(e.target.value)} /></label>
              <label>Objective<textarea value={objective} onChange={e => setObjective(e.target.value)} /></label>
              <label>Proposed solution<textarea value={solution} onChange={e => setSolution(e.target.value)} /></label>
              <button className="dy-button" onClick={() => void createProject()}>Create project</button>
            </div>
          )}
        </>
      )}
      <Notice error={error} />
    </article>
  );
}

function CoordinatorProjectActions({
  project, participants, csrf, onRefresh
}: {
  project: Data;
  participants: Data[];
  csrf: string;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [participantId, setParticipantId] = useState(String(participants[0]?.id ?? ""));
  const [taskTitle, setTaskTitle] = useState("Implement agreed solution");
  const [taskDescription, setTaskDescription] = useState("Complete the scoped work and document the result.");
  const [agreementId, setAgreementId] = useState("");
  const [agreementPrice, setAgreementPrice] = useState("1000");
  const [agreementCurrency, setAgreementCurrency] = useState("INR");
  const [deadline, setDeadline] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [businessReviewUrl, setBusinessReviewUrl] = useState("");
  const [deliverableId, setDeliverableId] = useState("");
  const [feedback, setFeedback] = useState("Reviewed against the documented acceptance criteria.");
  const [disputeId, setDisputeId] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("The coordinator reviewed the issue and clarified the agreed scope.");
  const [paymentId, setPaymentId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("1000");
  const [paymentReference, setPaymentReference] = useState("");
  const [allocationId, setAllocationId] = useState("");
  const [newStatus, setNewStatus] = useState(String(project.project_status ?? "proposed"));

  async function run(action: () => Promise<any>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(message);
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The operation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createAgreement() {
    await run(async () => {
      const result = await api<Data>(`/api/admin/projects/${project.id}/agreements`, {
        method: "POST",
        body: jsonBody({
          scopeOfWork: "Deliver the agreed digital solution within the defined scope. Commercial work begins only after all approvals.",
          deliverables: [{ title: "Completed digital solution", description: "Working solution and evidence against acceptance criteria." }],
          price: Number(agreementPrice),
          currency: agreementCurrency,
          deadline,
          acceptanceCriteria: "The solution must work as described, be demonstrated to the business and pass the agreed checks.",
          responsiblePayer: "Business owner",
          paymentTerms: "Payment is due after business verification."
        })
      }, csrf);
      setAgreementId(String(result.agreementId));
    }, "Agreement drafted.");
  }

  async function sendAgreement() {
    if (!agreementId) {
      setError("Create an agreement first or enter its ID.");
      return;
    }
    await run(async () => {
      const result = await api<Data>(`/api/admin/projects/${project.id}/agreements/${agreementId}/send`, {
        method: "POST", body: "{}"
      }, csrf);
      setBusinessReviewUrl(`${window.location.origin}${result.businessReviewPath}`);
    }, "Agreement sent. Share the business review link with the business owner.");
  }

  async function loadAllocations(payment: string) {
    const result = await api<Data>(`/api/admin/projects/${project.id}/payments`);
    const rows = items(result, "allocations").filter(row => String(row.project_payment_id) === payment);
    if (rows[0]) setAllocationId(String(rows[0].id));
  }

  return (
    <div className="dy-subpanel">
      <div className="dy-card-head">
        <h3>Project operations</h3>
        <span className="dy-status">{label(project.project_status)}</span>
      </div>
      <Notice error={error} success={notice} />

      <details>
        <summary>Participant assignment and project status</summary>
        <div className="dy-stack dy-inner">
          <label>Participant
            <select value={participantId} onChange={e => setParticipantId(e.target.value)}>
              <option value="">Select participant</option>
              {participants.map(person => <option key={person.id} value={person.id}>{person.display_name} — {person.email}</option>)}
            </select>
          </label>
          <button className="dy-button" disabled={busy || !participantId} onClick={() => void run(
            () => api(`/api/admin/projects/${project.id}/assignments`, {
              method: "POST",
              body: jsonBody({ participantId: Number(participantId), assignmentRole: "Contributor" })
            }, csrf),
            "Participant assignment created. The participant must accept it."
          )}>Assign participant</button>
          <label>Project status
            <select value={newStatus} onChange={e => setNewStatus(e.target.value)}>
              {["proposed", "demonstration", "business_review", "agreement_pending", "agreed", "in_progress", "delivered", "business_verification", "completed", "correction_requested", "disputed", "cancelled"].map(status =>
                <option key={status} value={status}>{label(status)}</option>
              )}
            </select>
          </label>
          <button className="dy-button dy-button-light" disabled={busy || newStatus === project.project_status} onClick={() => void run(
            () => api(`/api/admin/projects/${project.id}/status`, {
              method: "PATCH",
              body: jsonBody({ status: newStatus, reason: "Coordinator updated project status after review." })
            }, csrf),
            "Project status updated."
          )}>Update status</button>
        </div>
      </details>

      <details>
        <summary>Project tasks</summary>
        <div className="dy-stack dy-inner">
          <label>Task title<input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} /></label>
          <label>Task description<textarea rows={2} value={taskDescription} onChange={e => setTaskDescription(e.target.value)} /></label>
          <label>Assign to
            <select value={participantId} onChange={e => setParticipantId(e.target.value)}>
              <option value="">Unassigned</option>
              {participants.map(person => <option key={person.id} value={person.id}>{person.display_name}</option>)}
            </select>
          </label>
          <button className="dy-button" disabled={busy || taskTitle.trim().length < 3 || taskDescription.trim().length < 5} onClick={() => void run(
            () => api(`/api/admin/projects/${project.id}/tasks`, {
              method: "POST",
              body: jsonBody({ title: taskTitle, description: taskDescription, assignedParticipantId: participantId ? Number(participantId) : null })
            }, csrf),
            "Task created."
          )}>Create task</button>
        </div>
      </details>

      <details>
        <summary>Agreement and business approval</summary>
        <div className="dy-stack dy-inner">
          <label>Price<input type="number" min="0.01" step="0.01" value={agreementPrice} onChange={e => setAgreementPrice(e.target.value)} /></label>
          <label>Currency
            <select value={agreementCurrency} onChange={e => setAgreementCurrency(e.target.value)}>
              <option value="INR">INR</option><option value="IDR">IDR</option>
            </select>
          </label>
          <label>Deadline<input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></label>
          <button className="dy-button" disabled={busy || Number(agreementPrice) <= 0} onClick={() => void createAgreement()}>Draft agreement</button>
          <label>Agreement ID<input inputMode="numeric" value={agreementId} onChange={e => setAgreementId(e.target.value)} placeholder="Created agreement ID" /></label>
          <button className="dy-button dy-button-light" disabled={busy || !agreementId} onClick={() => void sendAgreement()}>Send for approvals</button>
          {businessReviewUrl && <p><a href={businessReviewUrl} target="_blank" rel="noreferrer">Open business review link</a></p>}
          <button className="dy-button" disabled={busy || !agreementId} onClick={() => void run(
            () => api(`/api/admin/projects/${project.id}/agreements/${agreementId}/activate`, {
              method: "POST", body: "{}"
            }, csrf),
            "Agreement activated. Commercial work may begin."
          )}>Activate after approvals</button>
          <p className="dy-muted">Activation requires approval from the business and every assigned participant.</p>
        </div>
      </details>

      <details>
        <summary>Deliverable verification and dispute resolution</summary>
        <div className="dy-stack dy-inner">
          <label>Deliverable ID (optional)<input inputMode="numeric" value={deliverableId} onChange={e => setDeliverableId(e.target.value)} /></label>
          <label>Feedback<textarea rows={2} value={feedback} onChange={e => setFeedback(e.target.value)} /></label>
          <div className="dy-actions">
            <button className="dy-button" disabled={busy} onClick={() => void run(
              () => api(`/api/admin/projects/${project.id}/verification`, {
                method: "POST",
                body: jsonBody({ deliverableId: deliverableId ? Number(deliverableId) : null, decision: "accepted", feedback })
              }, csrf),
              "Coordinator verification recorded."
            )}>Accept</button>
            <button className="dy-button dy-button-light" disabled={busy} onClick={() => void run(
              () => api(`/api/admin/projects/${project.id}/verification`, {
                method: "POST",
                body: jsonBody({ deliverableId: deliverableId ? Number(deliverableId) : null, decision: "revision_requested", feedback })
              }, csrf),
              "Revision requested."
            )}>Request revision</button>
          </div>
          <label>Dispute ID<input inputMode="numeric" value={disputeId} onChange={e => setDisputeId(e.target.value)} /></label>
          <label>Resolution notes<textarea rows={2} value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)} /></label>
          <button className="dy-button dy-button-light" disabled={busy || !disputeId} onClick={() => void run(
            () => api(`/api/admin/projects/${project.id}/disputes/${disputeId}/resolve`, {
              method: "POST",
              body: jsonBody({ resolutionStatus: "resolved", resolutionNotes })
            }, csrf),
            "Dispute resolved."
          )}>Resolve dispute</button>
        </div>
      </details>

      <details>
        <summary>Business payment and youth payout</summary>
        <div className="dy-stack dy-inner">
          <label>Approved agreement ID<input inputMode="numeric" value={agreementId} onChange={e => setAgreementId(e.target.value)} /></label>
          <label>Payment amount<input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} /></label>
          <label>Payment reference<input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} /></label>
          <button className="dy-button" disabled={busy || !agreementId || Number(paymentAmount) <= 0} onClick={() => void run(async () => {
            const result = await api<Data>(`/api/admin/projects/${project.id}/payments`, {
              method: "POST",
              body: jsonBody({
                agreementId: Number(agreementId),
                payerName: "Business payer",
                recipientDescription: "Youth project participants",
                amount: Number(paymentAmount),
                currency: agreementCurrency,
                paymentReference: paymentReference || null
              })
            }, csrf);
            setPaymentId(String(result.paymentId));
          }, "Payment recorded as pending verification.")}>Record payment</button>
          <label>Payment ID<input inputMode="numeric" value={paymentId} onChange={e => setPaymentId(e.target.value)} /></label>
          <button className="dy-button dy-button-light" disabled={busy || !paymentId} onClick={() => void run(
            () => api(`/api/admin/projects/${project.id}/payments/${paymentId}/verify`, {
              method: "PATCH",
              body: jsonBody({ paymentDate: new Date().toISOString().slice(0, 10), paymentReference: paymentReference || null })
            }, csrf),
            "Business payment receipt verified."
          )}>Verify receipt</button>
          <label>Allocate to participant
            <select value={participantId} onChange={e => setParticipantId(e.target.value)}>
              <option value="">Select participant</option>
              {participants.map(person => <option key={person.id} value={person.id}>{person.display_name}</option>)}
            </select>
          </label>
          <button className="dy-button" disabled={busy || !paymentId || !participantId} onClick={() => void run(async () => {
            await api(`/api/admin/projects/${project.id}/payments/${paymentId}/allocations`, {
              method: "PUT",
              body: jsonBody({ allocations: [{ participantId: Number(participantId), amount: Number(paymentAmount) }] })
            }, csrf);
            await loadAllocations(paymentId);
          }, "100% of this verified payment allocated to the participant.")}>Allocate full payment</button>
          <label>Allocation ID<input inputMode="numeric" value={allocationId} onChange={e => setAllocationId(e.target.value)} /></label>
          <button className="dy-button dy-button-light" disabled={busy || !paymentId || !allocationId} onClick={() => void run(
            () => api(`/api/admin/projects/${project.id}/payments/${paymentId}/allocations/${allocationId}/payout`, {
              method: "PATCH",
              body: jsonBody({ payoutMethod: "upi", payoutDate: new Date().toISOString().slice(0, 10), payoutReference: paymentReference || null })
            }, csrf),
            "Participant payout recorded and verified."
          )}>Mark payout paid (UPI)</button>
          <p className="dy-muted">Allocations must equal the full verified payment. Only accepted project members can receive them.</p>
        </div>
      </details>
    </div>
  );
}

function CoordinatorManagementPanel({ csrf }: { csrf: string }) {
  const [invitations, setInvitations] = useState<Data[]>([]);
  const [modules, setModules] = useState<Data[]>([]);
  const [pilotSites, setPilotSites] = useState<Data[]>([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [siteId, setSiteId] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [inviteUrl, setInviteUrl] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("Digital operations");
  const [minutes, setMinutes] = useState("45");
  const [exerciseTitle, setExerciseTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [outcome, setOutcome] = useState("");
  const [criteria, setCriteria] = useState("Accuracy and completeness\nClarity and usability");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        api("/api/admin/participants/invitations"),
        api("/api/learning/modules"),
        api("/api/admin/pilot-sites")
      ]);
      if (results[0].status === "fulfilled") setInvitations(items(results[0].value, "invitations"));
      if (results[1].status === "fulfilled") setModules(items(results[1].value, "modules"));
      if (results[2].status === "fulfilled") setPilotSites(items(results[2].value, "pilotSites"));
      const failed = results.find(result => result.status === "rejected");
      if (failed?.status === "rejected") setError(failed.reason instanceof Error ? failed.reason.message : "Unable to load coordinator data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function run(action: () => Promise<any>, message: string) {
    setBusy(true); setError(""); setSuccess("");
    try { await action(); setSuccess(message); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Request failed."); }
    finally { setBusy(false); }
  }

  async function createInvitation(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await api<Data>("/api/admin/participants/invitations", {
        method: "POST",
        body: jsonBody({
          email: email.trim(),
          displayName: displayName.trim() || null,
          pilotSiteId: Number(siteId),
          expiresInDays: Number(expiresInDays)
        })
      }, csrf);
      if (!result.invitationToken || typeof result.registrationPath !== "string") {
        throw new Error("Invitation created, but the server did not return its registration link.");
      }
      const registrationUrl = new URL(result.registrationPath, window.location.origin);
      if (registrationUrl.origin !== window.location.origin || registrationUrl.pathname !== "/participant" || !registrationUrl.searchParams.has("invite")) {
        throw new Error("The server returned an invalid participant registration link.");
      }
      setInviteUrl(registrationUrl.toString());
      setEmail(""); setDisplayName("");
    }, "Participant invitation created.");
  }

  async function createModule(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = await api<Data>("/api/admin/learning/modules", {
        method: "POST",
        body: jsonBody({
          slug: slug.trim(), title: title.trim(), summary: summary.trim(),
          contentMarkdown: content.trim(), skillCategory: category.trim(),
          difficulty: "beginner", estimatedMinutes: Number(minutes)
        })
      }, csrf);
      setModuleId(String(result.moduleId));
      setTitle(""); setSlug(""); setSummary(""); setContent("");
    }, "Draft module created. Add an exercise before publishing.");
  }

  async function addExercise(event: FormEvent) {
    event.preventDefault();
    await run(() => api(`/api/admin/learning/modules/${moduleId}/exercises`, {
      method: "POST",
      body: jsonBody({
        title: exerciseTitle.trim(),
        instructions: instructions.trim(),
        simulatedMaterials: {
          business: "Fictional Sample Cafe",
          note: "Use fictional information only; do not use real customer data."
        },
        expectedOutcome: outcome.trim(),
        reviewCriteria: criteria.split("\n").map(v => v.trim()).filter(Boolean),
        sortOrder: 1
      })
    }, csrf), "Exercise added to the draft module.");
  }

  return (
    <section className="dy-stack">
      <Notice error={error} success={success} />

      <article className="dy-card dy-form">
        <h2>Participant invitations</h2>
        <p className="dy-muted">Create a time-limited invitation for a pilot participant.</p>
        <form className="dy-stack" onSubmit={createInvitation}>
          <label>Participant email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label>Display name (optional)<input value={displayName} onChange={e => setDisplayName(e.target.value)} /></label>
          <label>Pilot site
            <select required value={siteId} onChange={e => setSiteId(e.target.value)}>
              <option value="">Select pilot site</option>
              {pilotSites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </label>
          <label>Expires in days<input type="number" min="1" max="30" required value={expiresInDays} onChange={e => setExpiresInDays(e.target.value)} /></label>
          <button className="dy-button" disabled={busy || !csrf || !siteId}>Create invitation</button>
        </form>

        {inviteUrl && <div className="dy-list-row">
          <strong>Registration link</strong>
          <input readOnly value={inviteUrl} onFocus={e => e.currentTarget.select()} />
          <button type="button" className="dy-button dy-button-light" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>Copy link</button>
        </div>}

        <h3>Invitation history</h3>
        {loading && <p className="dy-muted" role="status">Loading invitations and pilot sites…</p>}
        {!loading && invitations.map(inv => <div className="dy-list-row" key={inv.id}>
          <strong>{inv.display_name || inv.email}</strong>
          <p>{inv.email} · {inv.pilot_site}</p>
          <span className="dy-status">{inv.accepted_at ? "accepted" : inv.revoked_at ? "revoked" : "pending"}</span>
          {!inv.accepted_at && !inv.revoked_at && <button type="button" className="dy-button dy-button-light" disabled={busy} onClick={() => void run(
            () => api(`/api/admin/participants/invitations/${inv.id}/revoke`, { method: "POST", body: "{}" }, csrf),
            "Invitation revoked."
          )}>Revoke</button>}
        </div>)}
        {!loading && invitations.length === 0 && <p className="dy-muted">No invitations found.</p>}
      </article>

      <article className="dy-card dy-form">
        <h2>Learning content administration</h2>
        <p className="dy-muted">Create practical learning material using fictional examples.</p>
        <form className="dy-stack" onSubmit={createModule}>
          <label>Module title<input required minLength={3} value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label>URL slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={e => setSlug(e.target.value)} placeholder="digital-menu-basics" /></label>
          <label>Summary<textarea required minLength={5} rows={2} value={summary} onChange={e => setSummary(e.target.value)} /></label>
          <label>Lesson content (Markdown)<textarea required minLength={10} rows={5} value={content} onChange={e => setContent(e.target.value)} /></label>
          <label>Skill category<input required value={category} onChange={e => setCategory(e.target.value)} /></label>
          <label>Estimated minutes<input type="number" min="1" max="1440" value={minutes} onChange={e => setMinutes(e.target.value)} /></label>
          <button className="dy-button" disabled={busy || !csrf}>Create draft module</button>
        </form>

        <form className="dy-stack" onSubmit={addExercise}>
          <h3>Add exercise</h3>
          <label>Draft module ID<input type="number" min="1" required value={moduleId} onChange={e => setModuleId(e.target.value)} /></label>
          <label>Exercise title<input required value={exerciseTitle} onChange={e => setExerciseTitle(e.target.value)} /></label>
          <label>Instructions<textarea required rows={3} value={instructions} onChange={e => setInstructions(e.target.value)} /></label>
          <label>Expected outcome<textarea required rows={2} value={outcome} onChange={e => setOutcome(e.target.value)} /></label>
          <label>Review criteria (one per line)<textarea required rows={3} value={criteria} onChange={e => setCriteria(e.target.value)} /></label>
          <button className="dy-button" disabled={busy || !csrf || !moduleId}>Add exercise</button>
        </form>

        <h3>Publish module</h3>
        <button type="button" className="dy-button" disabled={busy || !csrf || !moduleId} onClick={() => void run(
          () => api(`/api/admin/learning/modules/${moduleId}`, {
            method: "PATCH", body: jsonBody({ publicationStatus: "published" })
          }, csrf),
          "Module published to the participant learning catalogue."
        )}>Publish module #{moduleId || "—"}</button>

        <h3>Published modules</h3>
        {loading && <p className="dy-muted" role="status">Loading modules…</p>}
        {modules.map(m => <div className="dy-list-row" key={m.id}>
          <strong>{m.title}</strong><p>{m.summary}</p>
          <small>{m.skill_category} · {m.estimated_minutes} minutes</small>
        </div>)}
        {modules.length === 0 && <p className="dy-muted">No published modules yet.</p>}
      </article>
    </section>
  );
}
function CoordinatorPortal() {
  const [csrf, setCsrf] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [diagnostics, setDiagnostics] = useState<Data[]>([]);
  const [projects, setProjects] = useState<Data[]>([]);
  const [participants, setParticipants] = useState<Data[]>([]);
  const [tab, setTab] = useState("diagnostics");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const session = await api<Data>("/api/auth/csrf");
        if (!session.csrfToken) throw new Error("Administrator session is unavailable.");
        setCsrf(session.csrfToken);
        setAuthenticated(true);
      } catch {
        setAuthenticated(false);
      } finally {
        setCheckingSession(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const result = await api<Data>("/api/auth/login", {
      method: "POST", body: jsonBody({ email, password })
    });
    setCsrf(result.csrfToken ?? "");
    setAuthenticated(true);
    setError("");
  }

  async function refresh() {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        api("/api/admin/diagnostics"),
        api("/api/admin/projects"),
        api("/api/admin/participants")
      ]);
      if (results[0].status === "fulfilled") setDiagnostics(items(results[0].value, "diagnostics"));
      if (results[1].status === "fulfilled") setProjects(items(results[1].value, "projects"));
      if (results[2].status === "fulfilled") setParticipants(items(results[2].value, "participants"));
      const failed = results.filter(r => r.status === "rejected");
      if (failed.length) setError(failed.length === results.length
        ? "Could not load coordinator data. Check your API URL and administrator session."
        : "Some coordinator data could not be loaded. Use Refresh to try again.");
      else setError("");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" }, csrf);
      setAuthenticated(false);
      setCsrf("");
      setDiagnostics([]);
      setProjects([]);
      setParticipants([]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign out failed.");
    }
  }

  useEffect(() => {
    if (authenticated) void refresh();
  }, [authenticated]);

  if (checkingSession) {
    return (
      <Page title="Coordinator workspace" subtitle="Review business problems, assess pilot readiness and monitor participants.">
        <div className="dy-card" role="status">Checking administrator session…</div>
      </Page>
    );
  }

  if (!authenticated) {
    return (
      <Page title="Coordinator workspace" subtitle="Review business problems, assess pilot readiness and monitor participants.">
        <LoginForm participant={false} onLogin={login} />
      </Page>
    );
  }

  return (
    <Page title="Coordinator workspace" subtitle="Human-led oversight of prioritisation, participant activity and projects.">
      <div className="dy-toolbar">
        <div className="dy-tabs">
          {["diagnostics", "projects", "participants", "management"].map(value => (
            <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label(value)}</button>
          ))}
        </div>
        <button className="dy-button dy-button-light" onClick={() => void refresh()}>Refresh</button>
        <button className="dy-button dy-button-light" onClick={() => void logout()}>Sign out</button>
      </div>
      <Notice error={error} />
      {tab === "diagnostics" && (
        <section className="dy-stack">
          <h2>Business problem intake ({diagnostics.length})</h2>
          {loading && <div className="dy-card" role="status">Loading diagnostics…</div>}
          {!loading && diagnostics.length === 0 && <div className="dy-card">No diagnostics are awaiting coordinator review.</div>}
          {diagnostics.map(item => (
            <DiagnosticCard key={item.id} diagnostic={item} csrf={csrf} onRefresh={refresh} />
          ))}
        </section>
      )}
      {tab === "projects" && (
        <section className="dy-stack">
          <h2>Projects ({projects.length})</h2>
          {loading && <div className="dy-card" role="status">Loading projects…</div>}
          {!loading && projects.length === 0 && <div className="dy-card">No projects created yet.</div>}
          {projects.map(project => (
            <article className="dy-card" key={project.id}>
              <div className="dy-card-head">
                <div><p className="dy-eyebrow">{project.project_code}</p><h2>{project.title}</h2></div>
                <span className="dy-status">{label(project.project_status)}</span>
              </div>
              <p>{project.objective}</p>
              <p className="dy-muted">{project.business_name} · {project.pilot_site}</p>
              <CoordinatorProjectActions project={project} participants={participants} csrf={csrf} onRefresh={refresh} />
            </article>
          ))}
        </section>
      )}
      {tab === "participants" && (
        <section className="dy-stack">
          <h2>Participants ({participants.length})</h2>
          {loading && <div className="dy-card" role="status">Loading participants…</div>}
          {!loading && participants.length === 0 && <div className="dy-card">No participants have registered yet.</div>}
          {participants.map(person => (
            <article className="dy-card dy-card-head" key={person.id}>
              <div>
                <h3>{person.display_name}</h3>
                <p>{person.email}</p>
                <p className="dy-muted">{person.pilot_site} · {label(person.account_status)}</p>
              </div>
              <span className="dy-status">{label(person.working_model)}</span>
            </article>
          ))}
        </section>
      )}
      {tab === "management" && <CoordinatorManagementPanel csrf={csrf} />}
    </Page>
  );
}

function BusinessReviewPortal() {
  const { pathname } = useLocation();
  const token = pathname.split("/").filter(Boolean)[2] ?? "";
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const result = await api<Data>(`/api/business/review/${encodeURIComponent(token)}`);
    setData(result);
  }

  useEffect(() => {
    void refresh().catch(e => setError(e instanceof Error ? e.message : "Review link unavailable."));
  }, [token]);

  async function act(action: () => Promise<any>, message: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(message);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit decision.");
    } finally {
      setBusy(false);
    }
  }

  const project = data?.project;
  const agreement = data?.agreement;
  const deliverables = items(data, "deliverables");

  return (
    <Page title="Business project review" subtitle="Review the agreed scope and verify work against the acceptance criteria.">
      <Notice error={error} success={success} />
      {!data && !error && <div className="dy-card">Loading business review…</div>}
      {project && (
        <div className="dy-stack">
          <article className="dy-card">
            <p className="dy-eyebrow">{project.project_code} · {project.pilot_site}</p>
            <h2>{project.title}</h2>
            <p>{project.objective}</p>
            <p><strong>Business:</strong> {project.business_name}</p>
            <p><strong>Project status:</strong> {label(project.project_status)}</p>
          </article>
          {agreement && (
            <article className="dy-card">
              <h2>Agreement · Version {agreement.version_number}</h2>
              <p>{agreement.scope_of_work}</p>
              <p><strong>Price:</strong> {agreement.currency} {agreement.price}</p>
              <p><strong>Deadline:</strong> {String(agreement.deadline).slice(0, 10)}</p>
              <p><strong>Responsible payer:</strong> {agreement.responsible_payer}</p>
              <h3>Acceptance criteria</h3>
              <p>{agreement.acceptance_criteria}</p>
              {agreement.agreement_status === "pending_approval" && (
                <div className="dy-actions">
                  <button className="dy-button" disabled={busy} onClick={() => void act(
                    () => api(`/api/business/review/${encodeURIComponent(token)}/agreements/${agreement.id}/decision`, {
                      method: "POST", body: jsonBody({ decision: "approved", comments: "Business approves the documented scope, price and acceptance criteria." })
                    }),
                    "Business agreement approval recorded."
                  )}>Approve agreement</button>
                  <button className="dy-button dy-button-light" disabled={busy} onClick={() => {
                    const comments = window.prompt("What changes are required? ");
                    if (comments?.trim()) void act(
                      () => api(`/api/business/review/${encodeURIComponent(token)}/agreements/${agreement.id}/decision`, {
                        method: "POST", body: jsonBody({ decision: "changes_requested", comments })
                      }),
                      "Requested agreement changes."
                    );
                  }}>Request changes</button>
                </div>
              )}
            </article>
          )}
          <article className="dy-card">
            <h2>Submitted deliverables</h2>
            {deliverables.length === 0 && <p>No deliverables have been submitted yet.</p>}
            {deliverables.map(deliverable => (
              <div className="dy-list-row" key={deliverable.id}>
                <h3>{deliverable.title}</h3>
                <p>{deliverable.description}</p>
                <p className="dy-muted">Status: {label(deliverable.delivery_status)}</p>
                {project.project_status === "business_verification" && deliverable.delivery_status !== "accepted" && (
                  <button className="dy-button" disabled={busy} onClick={() => void act(
                    () => api(`/api/business/review/${encodeURIComponent(token)}/verification`, {
                      method: "POST",
                      body: jsonBody({
                        deliverableId: Number(deliverable.id),
                        decision: "accepted",
                        feedback: "The business confirms this deliverable meets the agreed acceptance criteria."
                      })
                    }),
                    "Business verification recorded."
                  )}>Accept deliverable</button>
                )}
              </div>
            ))}
          </article>
          {project.project_status === "business_verification" && (
            <button className="dy-button dy-button-danger" disabled={busy} onClick={() => {
              const reason = window.prompt("Explain the issue requiring dispute (at least 10 characters):");
              if (reason && reason.trim().length >= 10) void act(
                () => api(`/api/business/review/${encodeURIComponent(token)}/disputes`, {
                  method: "POST", body: jsonBody({ reason })
                }),
                "Business dispute recorded."
              );
            }}>Raise a dispute</button>
          )}
        </div>
      )}
    </Page>
  );
}


function PlatformHome() {
  return (
    <div className="dy-page">
      <header className="site-header">
  <a href="/" className="site-brand"><span className="site-mark">dy</span><span>DIGITAL<br />YOUTH</span></a>
  <nav aria-label="Main navigation">
    <a href="/">Home</a>
    <a href="/business/intake">Business</a>
    <a href="/participant">Youth</a>
    <a href="/coordinator">Coordinator</a>
  </nav>
  <span className="site-online"><span></span> Pilot platform</span>
</header>

      <main className="dy-main dy-home">
        <section className="dy-home-hero">
          <p className="dy-eyebrow">COMMUNITY-FIRST · DIGITAL YOUTH PILOT</p>
          <h1>Real problems.<br />Local skills.<br />Solutions shaped together.</h1>
          <p className="dy-home-lead">
            We connect the everyday challenges of local businesses with
            the practical digital skills of young people. We listen first,
            train together and deliver solutions that businesses can verify.
          </p>
          <div className="dy-actions">
            <a className="dy-button" href="/business/intake">Start a business visit</a>
            <a className="dy-button dy-button-light" href="/participant">Youth workspace</a>
            <a className="dy-button dy-button-light" href="/coordinator">Coordinator workspace</a>
          </div>
        </section>

        <section className="dy-home-grid" aria-label="Platform workspaces">
          <article className="dy-card">
            <p className="dy-eyebrow">01 · BUSINESS</p>
            <h2>Bring a real problem</h2>
            <p>Describe operational challenges, review a proposed solution,
            agree on scope and price, and verify the completed work.</p>
            <a href="/business/intake">Business intake '</a>
          </article>
          <article className="dy-card">
            <p className="dy-eyebrow">02 · YOUTH</p>
            <h2>Learn, build and earn</h2>
            <p>Access training, develop skills, complete exercises,
            work on assigned projects and track verified earnings.</p>
            <a href="/participant">Participant workspace '</a>
          </article>
          <article className="dy-card">
            <p className="dy-eyebrow">03 · COORDINATION</p>
            <h2>Coordinate responsibly</h2>
            <p>Review diagnostics, assess opportunities with human judgement,
            assign participants and oversee delivery, verification and payment.</p>
            <a href="/coordinator">Coordinator workspace '</a>
          </article>
        </section>

        <section className="dy-card dy-home-process">
          <p className="dy-eyebrow">THE DIGITAL YOUTH MODEL</p>
          <h2>From a local problem to verified income</h2>
          <div className="dy-home-steps">
            {[
              ["01", "Listen", "Understand the business problem."],
              ["02", "Prioritise", "A human coordinator assesses feasibility and safety."],
              ["03", "Train", "Build relevant skills using learning resources."],
              ["04", "Demonstrate", "Show a proof of concept before commercial work."],
              ["05", "Agree", "Document scope, price, deadline and acceptance criteria."],
              ["06", "Deliver", "Complete the work and verify it with the business."],
              ["07", "Get paid", "Record payment, youth payout and learning." ]
            ].map(([number, title, description]) => (
              <article className="dy-home-step" key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="dy-home-principles">
          <h2>Built around trust and fair participation</h2>
          <p>Human-led decisions. No score-based exclusion. Written agreements
          before commercial work. Participants control portfolio visibility.
          During the pilot, youth retain 100% of their project income.</p>
          <p className="dy-muted">Pilot locations: Nusa Lembongan, Bali · Bengaluru, India</p>
        </section>
      </main>

      <footer className="dy-footer">
        DIGITAL YOUTH · Community-first digital opportunity
      </footer>
    </div>
  );
}

export function PortalRoot({ fallback }: { fallback: ReactNode }) {
  const { pathname } = useLocation();
  if (pathname === "/participant" || pathname.startsWith("/participant/")) return <ParticipantPortal />;
  if (pathname === "/coordinator" || pathname.startsWith("/coordinator/")) return <CoordinatorPortal />;
  if (pathname.startsWith("/business/review/")) return <BusinessReviewPortal />;
  if (pathname === "/business/intake") return <>{fallback}</>;
  return <PlatformHome />;
}



