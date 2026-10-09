import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';

// ==================== GRAPHQL QUERIES ====================
const Q = {
  // Test query — sabse simple
  testMe: `query { me { id name email } }`,

  // Get all projects with services and environments
  getProjects: `
    query {
      me {
        id
        name
        email
        projects {
          edges {
            node {
              id
              name
              createdAt
              services {
                edges {
                  node {
                    id
                    name
                  }
                }
              }
              environments {
                edges {
                  node {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  `,

  getServiceVariables: `
    query($projectId: String!, $environmentId: String!, $serviceId: String!) {
      variables(
        projectId: $projectId
        environmentId: $environmentId
        serviceId: $serviceId
      )
    }
  `,

  upsertVariable: `
    mutation(
      $projectId: String!
      $environmentId: String!
      $serviceId: String!
      $name: String!
      $value: String!
    ) {
      variableUpsert(
        input: {
          projectId: $projectId
          environmentId: $environmentId
          serviceId: $serviceId
          name: $name
          value: $value
        }
      )
    }
  `,

  deleteVariable: `
    mutation(
      $projectId: String!
      $environmentId: String!
      $serviceId: String!
      $name: String!
    ) {
      variableDelete(
        input: {
          projectId: $projectId
          environmentId: $environmentId
          serviceId: $serviceId
          name: $name
        }
      )
    }
  `,

  createProject: `
    mutation($name: String!) {
      projectCreate(input: { name: $name }) {
        id
        name
        createdAt
      }
    }
  `,

  deleteProject: `
    mutation($id: String!) {
      projectDelete(id: $id)
    }
  `,
};

// ==================== MAIN COMPONENT ====================
export default function Home() {
  const [tokens, setTokens] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: 'Ready', type: 'ok' });
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [search, setSearch] = useState('');

  // Modals
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showVarsModal, setShowVarsModal] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [debugData, setDebugData] = useState(null);

  const [newToken, setNewToken] = useState({
    email: '',
    token: '',
    priority: 1,
    type: 'account',
  });
  const [newProject, setNewProject] = useState({ name: '' });

  // Variables
  const [varsContext, setVarsContext] = useState(null);
  const [vars, setVars] = useState({});
  const [varsLoading, setVarsLoading] = useState(false);
  const [newVar, setNewVar] = useState({ name: '', value: '' });
  const [revealed, setRevealed] = useState({});

  // ============ LOAD ============
  useEffect(() => {
    try {
      const t = localStorage.getItem('rw_tokens_v4');
      if (t) {
        const p = JSON.parse(t);
        if (Array.isArray(p)) setTokens(p);
      }
      const pr = localStorage.getItem('rw_projects_v4');
      if (pr) {
        const p = JSON.parse(pr);
        if (Array.isArray(p)) setProjects(p);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (tokens.length) localStorage.setItem('rw_tokens_v4', JSON.stringify(tokens));
    else localStorage.removeItem('rw_tokens_v4');
  }, [tokens]);

  useEffect(() => {
    if (projects.length) localStorage.setItem('rw_projects_v4', JSON.stringify(projects));
  }, [projects]);

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const setStatusText = (text, type = 'ok') => setStatus({ text, type });

  // ============ API CALL ============
  const railwayCall = async (query, variables = {}, opts = {}) => {
    if (tokens.length === 0) throw new Error('Pehle token add karo!');

    const res = await fetch('/api/railway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables,
        tokens: tokens.map((t) => ({
          email: t.email,
          name: t.name,
          token: t.token.trim(),
          type: t.type,
          priority: t.priority,
        })),
        testOnly: opts.testOnly || false,
      }),
    });

    const data = await res.json();

    // Save debug info
    if (data.debug) {
      setDebugData(data.debug);
      console.log('🔍 Debug:', data.debug);
    }

    if (!res.ok) {
      const errMsg = data.error || 'Unknown error';
      const details = data.details ? '\n\n' + data.details.join('\n') : '';
      const err = new Error(errMsg + details);
      err.details = data.details;
      err.debug = data.debug;
      throw err;
    }

    return data;
  };

  // ============ TEST TOKEN (NEW) ============
  const testTokens = async () => {
    if (tokens.length === 0) return showToast('Pehle token add karo!', true);

    setLoading(true);
    setStatusText('Testing token...', 'loading');

    try {
      const result = await railwayCall(Q.testMe, {}, { testOnly: true });
      const me = result.data?.me;

      showToast(
        `✅ Token SAHI hai! Account: ${me?.email || 'unknown'}`,
        false
      );
      setStatusText(`✅ Token valid • ${me?.email}`);
    } catch (err) {
      showToast('❌ ' + err.message.split('\n')[0], true);
      setStatusText('❌ Token galat', 'error');
      setShowDebugModal(true);
    } finally {
      setLoading(false);
    }
  };

  // ============ LOAD PROJECTS ============
  const loadProjects = async () => {
    if (tokens.length === 0) return showToast('Pehle token add karo!', true);
    setLoading(true);
    setStatusText('Loading...', 'loading');

    try {
      const result = await railwayCall(Q.getProjects);
      const me = result.data?.me;
      if (!me) throw new Error('Railway se data nahi mila');

      const list = me.projects.edges.map((e) => ({
        id: e.node.id,
        name: e.node.name,
        createdAt: e.node.createdAt,
        services: e.node.services.edges.map((s) => s.node),
        environments: e.node.environments?.edges.map((en) => en.node) || [],
        url: `https://${e.node.name}.up.railway.app`,
        account: result.usedAccount?.email,
      }));

      setProjects(list);
      setStatusText(`Ready • ${me.email} • ${list.length} projects`);
      showToast(`✅ ${list.length} projects loaded`);
    } catch (err) {
      setStatusText('Error', 'error');
      showToast('❌ ' + err.message.split('\n')[0], true);
      setShowDebugModal(true);
    } finally {
      setLoading(false);
    }
  };

  // ============ TOKENS ============
  const addToken = () => {
    const { email, token, priority, type } = newToken;
    const trimmedToken = token.trim();

    if (!email.trim() || !trimmedToken) {
      return showToast('Naam aur token dono chahiye!', true);
    }

    if (trimmedToken.length < 20) {
      return showToast('Token bahut chhota hai — poora copy karo!', true);
    }

    if (/\s/.test(trimmedToken)) {
      return showToast('Token me space hai — saaf karo!', true);
    }

    const newT = {
      id: 'tok_' + Date.now(),
      email: email.trim(),
      name: email.trim(),
      token: trimmedToken,
      priority: parseInt(priority) || tokens.length + 1,
      type: type || 'account',
      addedAt: new Date().toISOString(),
    };

    setTokens([...tokens, newT].sort((a, b) => a.priority - b.priority));
    setNewToken({ email: '', token: '', priority: tokens.length + 2, type: 'account' });
    setShowTokenModal(false);
    showToast('✅ Token add ho gaya! Ab "Test Token" dabao.');
  };

  const deleteToken = (id) => {
    if (!confirm('Ye token delete karna hai?')) return;
    setTokens(tokens.filter((t) => t.id !== id));
    showToast('🗑️ Token delete ho gaya');
  };

  // ============ PROJECT CRUD ============
  const createProject = async () => {
    const { name } = newProject;
    if (!name.trim()) return showToast('Project naam daalo!', true);
    if (!/^[a-z0-9-]+$/.test(name)) {
      return showToast('Sirf lowercase, numbers, hyphen!', true);
    }

    setLoading(true);
    setStatusText('Creating...', 'loading');
    try {
      await railwayCall(Q.createProject, { name });
      showToast('🚀 Project create ho gaya!');
      setNewProject({ name: '' });
      setShowProjectModal(false);
      await loadProjects();
    } catch (err) {
      showToast('❌ ' + err.message.split('\n')[0], true);
    } finally {
      setLoading(false);
    }
  };

  const deleteProject = async (id, name) => {
    if (!confirm(`"${name}" delete karna hai?`)) return;
    setLoading(true);
    try {
      await railwayCall(Q.deleteProject, { id });
      showToast('🗑️ Project delete ho gaya');
      await loadProjects();
    } catch (err) {
      showToast('❌ ' + err.message.split('\n')[0], true);
    } finally {
      setLoading(false);
    }
  };

  // ============ VARIABLES ============
  const openVars = async (project, service) => {
    if (!project.environments || project.environments.length === 0) {
      return showToast('Is project me environment nahi mila', true);
    }

    const env = project.environments[0];
    setVarsContext({ project, service, environment: env });
    setShowVarsModal(true);
    setVars({});
    setRevealed({});
    await loadVars(project.id, env.id, service.id);
  };

  const loadVars = async (projectId, environmentId, serviceId) => {
    setVarsLoading(true);
    try {
      const result = await railwayCall(Q.getServiceVariables, {
        projectId,
        environmentId,
        serviceId,
      });
      setVars(result.data?.variables || {});
    } catch (err) {
      showToast('❌ ' + err.message.split('\n')[0], true);
    } finally {
      setVarsLoading(false);
    }
  };

  const upsertVariable = async () => {
    if (!newVar.name.trim()) return showToast('Variable naam daalo!', true);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newVar.name)) {
      return showToast('Naam letter ya _ se shuru ho!', true);
    }

    try {
      await railwayCall(Q.upsertVariable, {
        projectId: varsContext.project.id,
        environmentId: varsContext.environment.id,
        serviceId: varsContext.service.id,
        name: newVar.name,
        value: newVar.value,
      });
      showToast('✅ Variable save ho gaya!');
      setNewVar({ name: '', value: '' });
      await loadVars(
        varsContext.project.id,
        varsContext.environment.id,
        varsContext.service.id
      );
    } catch (err) {
      showToast('❌ ' + err.message.split('\n')[0], true);
    }
  };

  const deleteVariable = async (name) => {
    if (!confirm(`"${name}" delete karna hai?`)) return;
    try {
      await railwayCall(Q.deleteVariable, {
        projectId: varsContext.project.id,
        environmentId: varsContext.environment.id,
        serviceId: varsContext.service.id,
        name,
      });
      showToast('🗑️ Variable delete');
      await loadVars(
        varsContext.project.id,
        varsContext.environment.id,
        varsContext.service.id
      );
    } catch (err) {
      showToast('❌ ' + err.message.split('\n')[0], true);
    }
  };

  const toggleReveal = (key) =>
    setRevealed((r) => ({ ...r, [key]: !r[key] }));

  const copyText = (text, label = 'Text') => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => showToast(`📋 ${label} copy!`),
        () => showToast('Copy fail', true)
      );
    }
  };

  // ============ FILTERS ============
  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    tokens: tokens.length,
    projects: projects.length,
    services: projects.reduce((s, p) => s + (p.services?.length || 0), 0),
    today: projects.filter(
      (p) => new Date(p.createdAt).toDateString() === new Date().toDateString()
    ).length,
  };

  // ============ RENDER ============
  return (
    <>
      <Head>
        <title>🚂 Railway Panel</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <meta name="theme-color" content="#05050a" />
      </Head>

      <div className="app">
        {/* HEADER */}
        <header className="header">
          <div className="brand">
            <span className="logo">🚂</span>
            <div>
              <h1>Railway Panel</h1>
              <div className="status-line">
                <span className={`dot dot-${status.type}`} />
                <span className="status-text">{status.text}</span>
              </div>
            </div>
          </div>
        </header>

        {/* MAIN */}
        <main className="main">
          {/* ============ DASHBOARD ============ */}
          {activeTab === 'dashboard' && (
            <>
              <div className="stats-grid">
                <div className="stat">
                  <div className="num">{stats.tokens}</div>
                  <div className="lbl">Tokens</div>
                </div>
                <div className="stat">
                  <div className="num">{stats.projects}</div>
                  <div className="lbl">Projects</div>
                </div>
                <div className="stat">
                  <div className="num">{stats.services}</div>
                  <div className="lbl">Services</div>
                </div>
                <div className="stat">
                  <div className="num">{stats.today}</div>
                  <div className="lbl">Aaj</div>
                </div>
              </div>

              <div className="btn-row">
                <button
                  className="btn btn-primary"
                  onClick={loadProjects}
                  disabled={loading}
                >
                  {loading ? '⏳' : '🔄'} Refresh
                </button>
                <button
                  className="btn btn-warning"
                  onClick={testTokens}
                  disabled={loading || tokens.length === 0}
                >
                  🧪 Test
                </button>
                <button
                  className="btn btn-success"
                  onClick={() => setShowTokenModal(true)}
                >
                  ➕ Token
                </button>
              </div>

              {tokens.length === 0 && (
                <div className="info">
                  💡 <b>Shuru karo:</b> Pehle <b>➕ Token</b> dabao aur Railway ka token
                  add karo. Phir <b>🧪 Test</b> dabao — agar token sahi hai toh{' '}
                  <b>✅</b> message aayega.
                </div>
              )}

              {projects.length > 0 && (
                <>
                  <input
                    type="text"
                    className="search"
                    placeholder="🔍 Project search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <ProjectList
                    projects={filtered}
                    onCopy={copyText}
                    onDelete={deleteProject}
                    onVars={openVars}
                  />
                </>
              )}

              {projects.length === 0 && tokens.length > 0 && !loading && (
                <div className="empty">
                  <div className="empty-icon">📦</div>
                  <h3>Koi project nahi</h3>
                  <p>Refresh dabao ya naya project banao</p>
                </div>
              )}
            </>
          )}

          {/* ============ TOKENS ============ */}
          {activeTab === 'tokens' && (
            <>
              <div className="btn-row">
                <button
                  className="btn btn-success btn-full"
                  onClick={() => setShowTokenModal(true)}
                >
                  ➕ Naya Token Add Karo
                </button>
              </div>

              <div className="info">
                🔑 <b>Token format:</b> Railway ka token UUID jaisa hota hai, jaise
                <code
                  style={{
                    background: '#0a0a0f',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    marginLeft: '4px',
                    fontSize: '11px',
                    display: 'inline-block',
                    marginTop: '4px',
                  }}
                >
                  47d0d096-9d73-4935-9eef-d98fce82cd73
                </code>
                <br />
                <br />
                <b>Kahan se lo:</b> Railway → Account Settings → Tokens → Create Token
                → <b>My Projects</b> workspace select karo
              </div>

              {tokens.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">🔑</div>
                  <h3>Koi token nahi</h3>
                  <p>Upar wale button se add karo</p>
                </div>
              ) : (
                <div className="list">
                  {tokens.map((t, i) => (
                    <div key={t.id} className="token-item">
                      <div className="token-head">
                        <span className="token-name">{t.email}</span>
                        {i === 0 && <span className="chip chip-green">Primary</span>}
                      </div>
                      <div className="token-meta">
                        <span className="chip">Priority {t.priority}</span>
                        <span className="chip chip-blue">{t.type || 'account'}</span>
                        <span className="chip chip-purple">
                          {t.token.length} chars
                        </span>
                      </div>
                      <div className="token-value">
                        {t.token.substring(0, 16)}...{t.token.slice(-8)}
                      </div>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteToken(t.id)}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ============ PROJECTS ============ */}
          {activeTab === 'projects' && (
            <>
              <div className="btn-row">
                <button
                  className="btn btn-primary"
                  onClick={loadProjects}
                  disabled={loading}
                >
                  🔄 Refresh
                </button>
                <button
                  className="btn btn-success"
                  onClick={() => setShowProjectModal(true)}
                  disabled={tokens.length === 0}
                >
                  ➕ New
                </button>
              </div>

              {projects.length > 0 && (
                <input
                  type="text"
                  className="search"
                  placeholder="🔍 Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              )}

              {projects.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">📦</div>
                  <h3>Koi project nahi</h3>
                  <p>Refresh dabao ya naya banao</p>
                </div>
              ) : (
                <ProjectList
                  projects={filtered}
                  onCopy={copyText}
                  onDelete={deleteProject}
                  onVars={openVars}
                />
              )}
            </>
          )}
        </main>

        {/* BOTTOM NAV */}
        <nav className="bottom-nav">
          <button
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-label">Home</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'tokens' ? 'active' : ''}`}
            onClick={() => setActiveTab('tokens')}
          >
            <span className="nav-icon">🔑</span>
            <span className="nav-label">Tokens</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'projects' ? 'active' : ''}`}
            onClick={() => setActiveTab('projects')}
          >
            <span className="nav-icon">📦</span>
            <span className="nav-label">Projects</span>
          </button>
        </nav>

        {/* ============ TOKEN MODAL ============ */}
        {showTokenModal && (
          <div
            className="overlay"
            onClick={(e) => e.target === e.currentTarget && setShowTokenModal(false)}
          >
            <div className="sheet">
              <div className="sheet-handle" />
              <h2>🔑 Naya Token</h2>
              <p className="hint">
                Railway → Account Settings → Tokens → Create Token → <b>My Projects</b>{' '}
                select karo
              </p>

              <label>Naam / Email</label>
              <input
                type="text"
                placeholder="e.g., team7hacker7@gmail.com"
                value={newToken.email}
                onChange={(e) => setNewToken({ ...newToken, email: e.target.value })}
              />

              <label>Token Type (info only)</label>
              <select
                value={newToken.type}
                onChange={(e) => setNewToken({ ...newToken, type: e.target.value })}
              >
                <option value="account">👤 Account Token</option>
                <option value="team">👥 My Projects / Workspace</option>
                <option value="project">📦 Project Token</option>
              </select>

              <label>Railway Token (UUID format)</label>
              <input
                type="text"
                placeholder="47d0d096-9d73-4935-9eef-..."
                value={newToken.token}
                onChange={(e) => setNewToken({ ...newToken, token: e.target.value })}
                autoComplete="off"
                spellCheck="false"
              />
              {newToken.token && (
                <div
                  style={{
                    fontSize: '11px',
                    color: '#9ca3af',
                    marginTop: '6px',
                  }}
                >
                  Length: {newToken.token.trim().length} chars
                  {newToken.token.length >= 30 ? ' ✅' : ' ⚠️ (bahut chhota?)'}
                </div>
              )}

              <label>Priority (1 = highest)</label>
              <input
                type="number"
                min="1"
                value={newToken.priority}
                onChange={(e) => setNewToken({ ...newToken, priority: e.target.value })}
              />

              <div className="sheet-actions">
                <button
                  className="btn btn-outline"
                  onClick={() => setShowTokenModal(false)}
                >
                  Cancel
                </button>
                <button className="btn btn-success" onClick={addToken}>
                  ✅ Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ PROJECT MODAL ============ */}
        {showProjectModal && (
          <div
            className="overlay"
            onClick={(e) => e.target === e.currentTarget && setShowProjectModal(false)}
          >
            <div className="sheet">
              <div className="sheet-handle" />
              <h2>🚀 Naya Project</h2>
              <p className="hint">Lowercase, numbers, hyphen only</p>

              <label>Project Name</label>
              <input
                type="text"
                placeholder="my-awesome-app"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              />

              <div className="sheet-actions">
                <button
                  className="btn btn-outline"
                  onClick={() => setShowProjectModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-success"
                  onClick={createProject}
                  disabled={loading}
                >
                  {loading ? '⏳' : '🚀'} Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ VARIABLES MODAL ============ */}
        {showVarsModal && varsContext && (
          <div
            className="overlay"
            onClick={(e) => e.target === e.currentTarget && setShowVarsModal(false)}
          >
            <div className="sheet sheet-large">
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div>
                  <h2>🔐 Variables</h2>
                  <p className="hint">
                    {varsContext.project.name} → {varsContext.service.name}
                  </p>
                </div>
                <button className="close-btn" onClick={() => setShowVarsModal(false)}>
                  ✕
                </button>
              </div>

              <div className="var-add">
                <input
                  placeholder="KEY"
                  value={newVar.name}
                  onChange={(e) =>
                    setNewVar({ ...newVar, name: e.target.value.toUpperCase() })
                  }
                />
                <input
                  placeholder="VALUE"
                  value={newVar.value}
                  onChange={(e) => setNewVar({ ...newVar, value: e.target.value })}
                />
                <button className="btn btn-success btn-sm" onClick={upsertVariable}>
                  ➕
                </button>
              </div>

              {varsLoading ? (
                <div className="vars-load">⏳ Loading...</div>
              ) : Object.keys(vars).length === 0 ? (
                <div className="vars-empty">📭 Koi variable nahi</div>
              ) : (
                <div className="vars-list">
                  {Object.entries(vars).map(([key, value]) => (
                    <div key={key} className="var-item">
                      <div className="var-key">{key}</div>
                      <div className="var-val">
                        {revealed[key] ? (
                          <code>{String(value)}</code>
                        ) : (
                          <code className="mask">••••••••</code>
                        )}
                      </div>
                      <div className="var-btns">
                        <button
                          className="icon-btn"
                          onClick={() => toggleReveal(key)}
                        >
                          {revealed[key] ? '🙈' : '👁️'}
                        </button>
                        <button
                          className="icon-btn"
                          onClick={() => copyText(String(value), 'Value')}
                        >
                          📋
                        </button>
                        <button
                          className="icon-btn"
                          onClick={() => deleteVariable(key)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ DEBUG MODAL ============ */}
        {showDebugModal && debugData && (
          <div
            className="overlay"
            onClick={(e) => e.target === e.currentTarget && setShowDebugModal(false)}
          >
            <div className="sheet sheet-large">
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div>
                  <h2>🔍 Debug Info</h2>
                  <p className="hint">Ye info developer ko dikhao</p>
                </div>
                <button className="close-btn" onClick={() => setShowDebugModal(false)}>
                  ✕
                </button>
              </div>

              <pre
                style={{
                  background: '#0a0a0f',
                  padding: '14px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  color: '#cbd5e1',
                  overflow: 'auto',
                  maxHeight: '400px',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {JSON.stringify(debugData, null, 2)}
              </pre>

              <button
                className="btn btn-primary btn-full"
                style={{ marginTop: '14px' }}
                onClick={() => {
                  copyText(JSON.stringify(debugData, null, 2), 'Debug info');
                }}
              >
                📋 Copy Debug Info
              </button>
            </div>
          </div>
        )}

        {/* ============ TOAST ============ */}
        {toast && (
          <div className={`toast ${toast.isError ? 'err' : ''}`}>{toast.msg}</div>
        )}
      </div>

      <style jsx global>{`
        .app {
          min-height: 100vh;
          padding-bottom: 90px;
          background:
            radial-gradient(circle at 0% 0%, rgba(168, 85, 247, 0.08) 0%, transparent 40%),
            radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.08) 0%, transparent 40%),
            #05050a;
        }

        .header {
          padding: 16px;
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(5, 5, 10, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(42, 42, 74, 0.4);
        }

        .brand { display: flex; align-items: center; gap: 12px; }

        .logo { font-size: 28px; filter: drop-shadow(0 0 12px rgba(168, 85, 247, 0.5)); }

        .header h1 {
          font-size: 18px;
          font-weight: 700;
          background: linear-gradient(90deg, #a855f7, #3b82f6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .status-line { display: flex; align-items: center; gap: 6px; margin-top: 3px; }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 8px #22c55e;
          animation: pulse 2s infinite;
          flex-shrink: 0;
        }

        .dot-loading { background: #f59e0b; box-shadow: 0 0 8px #f59e0b; }
        .dot-error { background: #ef4444; box-shadow: 0 0 8px #ef4444; }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .status-text {
          font-size: 11px;
          color: #9ca3af;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 240px;
        }

        .main { padding: 16px; }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin-bottom: 16px;
        }

        .stat {
          background: linear-gradient(135deg, #12121f, #0f0f1a);
          border: 1px solid #2a2a4a;
          border-radius: 14px;
          padding: 14px;
          position: relative;
          overflow: hidden;
        }

        .stat::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, #a855f7, #3b82f6);
          opacity: 0.6;
        }

        .num {
          font-size: 26px;
          font-weight: 800;
          background: linear-gradient(135deg, #a855f7, #6366f1);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .lbl {
          font-size: 11px;
          color: #9ca3af;
          margin-top: 4px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .btn-row {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .btn {
          padding: 12px 18px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          transition: all 0.15s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 44px;
          touch-action: manipulation;
        }

        .btn:active:not(:disabled) { transform: scale(0.96); }
        .btn:disabled { opacity: 0.4; }

        .btn-full { width: 100%; }

        .btn-primary {
          background: linear-gradient(135deg, #a855f7, #6366f1);
          color: #fff;
          box-shadow: 0 4px 15px rgba(168, 85, 247, 0.3);
          flex: 1;
        }

        .btn-success {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: #fff;
          box-shadow: 0 4px 15px rgba(34, 197, 94, 0.25);
          flex: 1;
        }

        .btn-warning {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: #fff;
          box-shadow: 0 4px 15px rgba(245, 158, 11, 0.25);
        }

        .btn-danger {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
        }

        .btn-outline {
          background: transparent;
          color: #a855f7;
          border: 1.5px solid #a855f7;
        }

        .btn-sm {
          padding: 8px 14px;
          font-size: 13px;
          min-height: 38px;
        }

        .info {
          background: rgba(59, 130, 246, 0.08);
          border: 1px solid rgba(59, 130, 246, 0.25);
          padding: 14px;
          border-radius: 12px;
          margin-bottom: 16px;
          font-size: 13px;
          color: #93c5fd;
          line-height: 1.6;
        }

        .info code {
          color: #fbbf24;
          word-break: break-all;
        }

        .search {
          width: 100%;
          padding: 14px 16px;
          background: #12121f;
          border: 1px solid #2a2a4a;
          border-radius: 12px;
          color: #fff;
          font-size: 15px;
          margin-bottom: 16px;
        }

        .search:focus {
          outline: none;
          border-color: #a855f7;
          box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.15);
        }

        .list { display: flex; flex-direction: column; gap: 12px; }

        .proj-card {
          background: linear-gradient(135deg, #12121f, #0f0f1a);
          border: 1px solid #2a2a4a;
          border-radius: 16px;
          padding: 16px;
          position: relative;
          overflow: hidden;
          transition: all 0.2s;
        }

        .proj-card:active {
          transform: scale(0.99);
          border-color: #a855f7;
        }

        .proj-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 4px;
          height: 100%;
          background: linear-gradient(180deg, #a855f7, #3b82f6);
        }

        .proj-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 8px;
        }

        .proj-name {
          font-size: 16px;
          font-weight: 700;
          color: #fff;
          word-break: break-all;
          flex: 1;
          padding-left: 8px;
        }

        .chip {
          display: inline-flex;
          align-items: center;
          padding: 3px 10px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 700;
          background: rgba(148, 163, 184, 0.15);
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        .chip-green { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
        .chip-blue { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
        .chip-purple { background: rgba(168, 85, 247, 0.15); color: #a855f7; }

        .proj-meta {
          font-size: 12px;
          color: #9ca3af;
          line-height: 1.7;
          padding-left: 8px;
          margin-bottom: 10px;
        }

        .services {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 12px;
          padding-left: 8px;
        }

        .svc {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 10px;
          background: rgba(10, 10, 15, 0.6);
          border: 1px solid #2a2a4a;
          border-radius: 10px;
          font-size: 12px;
          gap: 8px;
        }

        .svc-name {
          color: #cbd5e1;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .proj-actions {
          display: flex;
          gap: 8px;
          padding-left: 8px;
        }

        .proj-actions .btn {
          flex: 1;
          padding: 10px;
          font-size: 12px;
        }

        .token-item {
          background: linear-gradient(135deg, #12121f, #0f0f1a);
          border: 1px solid #2a2a4a;
          border-radius: 14px;
          padding: 16px;
          margin-bottom: 12px;
        }

        .token-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
          flex-wrap: wrap;
        }

        .token-name {
          font-size: 14px;
          font-weight: 700;
          color: #fff;
          word-break: break-all;
        }

        .token-meta {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }

        .token-value {
          font-family: 'Courier New', monospace;
          font-size: 11px;
          color: #6b7280;
          background: #0a0a0f;
          padding: 8px 12px;
          border-radius: 8px;
          margin-bottom: 10px;
          word-break: break-all;
        }

        .empty {
          text-align: center;
          padding: 60px 20px;
          background: #12121f;
          border-radius: 16px;
          border: 2px dashed #2a2a4a;
        }

        .empty-icon {
          font-size: 56px;
          margin-bottom: 16px;
          opacity: 0.6;
        }

        .empty h3 { font-size: 16px; color: #e5e7eb; margin-bottom: 6px; }
        .empty p { font-size: 13px; color: #6b7280; }

        .bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 72px;
          background: rgba(10, 10, 15, 0.95);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-top: 1px solid rgba(42, 42, 74, 0.6);
          display: flex;
          z-index: 50;
          padding-bottom: env(safe-area-inset-bottom);
        }

        .nav-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          color: #6b7280;
          transition: all 0.2s;
          font-size: 10px;
          font-weight: 600;
          position: relative;
        }

        .nav-item.active { color: #a855f7; }

        .nav-item.active::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 30px;
          height: 3px;
          background: linear-gradient(90deg, #a855f7, #6366f1);
          border-radius: 0 0 3px 3px;
        }

        .nav-item:active { transform: scale(0.92); }
        .nav-icon { font-size: 22px; line-height: 1; }
        .nav-label { text-transform: uppercase; letter-spacing: 0.5px; }

        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          z-index: 100;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          animation: fadeIn 0.2s;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .sheet {
          background: #12121f;
          border-radius: 24px 24px 0 0;
          padding: 8px 20px 30px;
          width: 100%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          padding-bottom: calc(30px + env(safe-area-inset-bottom));
        }

        .sheet-large { max-height: 85vh; }

        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        .sheet-handle {
          width: 40px;
          height: 4px;
          background: #2a2a4a;
          border-radius: 4px;
          margin: 8px auto 16px;
        }

        .sheet h2 {
          font-size: 20px;
          color: #a855f7;
          margin-bottom: 6px;
          font-weight: 700;
        }

        .sheet-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
          gap: 10px;
        }

        .hint {
          font-size: 12px;
          color: #9ca3af;
          margin-bottom: 16px;
          line-height: 1.5;
        }

        .sheet label {
          display: block;
          font-size: 12px;
          color: #9ca3af;
          margin-bottom: 6px;
          margin-top: 14px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        .sheet input,
        .sheet select {
          width: 100%;
          padding: 14px 16px;
          background: #0a0a0f;
          border: 1px solid #2a2a4a;
          border-radius: 12px;
          color: #fff;
          font-size: 15px;
          transition: all 0.2s;
        }

        .sheet input:focus,
        .sheet select:focus {
          outline: none;
          border-color: #a855f7;
          box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.15);
        }

        .sheet-actions {
          display: flex;
          gap: 10px;
          margin-top: 24px;
        }

        .sheet-actions .btn { flex: 1; }

        .close-btn {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
        }

        .var-add {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .var-add input {
          flex: 1;
          min-width: 100px;
          padding: 12px 14px;
          background: #0a0a0f;
          border: 1px solid #2a2a4a;
          border-radius: 10px;
          color: #fff;
          font-size: 14px;
        }

        .var-add input:focus { outline: none; border-color: #a855f7; }
        .var-add .btn { min-width: 44px; padding: 12px; }

        .vars-load, .vars-empty {
          text-align: center;
          padding: 40px 20px;
          color: #6b7280;
          font-size: 14px;
        }

        .vars-list { display: flex; flex-direction: column; gap: 8px; }

        .var-item {
          background: #0a0a0f;
          border: 1px solid #2a2a4a;
          border-radius: 12px;
          padding: 12px;
        }

        .var-key {
          font-size: 12px;
          font-weight: 700;
          color: #a855f7;
          margin-bottom: 6px;
          word-break: break-all;
          font-family: 'Courier New', monospace;
        }

        .var-val {
          font-size: 12px;
          color: #cbd5e1;
          margin-bottom: 10px;
          word-break: break-all;
          min-height: 20px;
        }

        .var-val code {
          font-family: 'Courier New', monospace;
          background: rgba(168, 85, 247, 0.08);
          padding: 3px 6px;
          border-radius: 4px;
        }

        .var-val .mask { color: #4b5563; letter-spacing: 2px; }

        .var-btns { display: flex; gap: 6px; justify-content: flex-end; }

        .icon-btn {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: rgba(42, 42, 74, 0.5);
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .icon-btn:active {
          transform: scale(0.9);
          background: rgba(168, 85, 247, 0.2);
        }

        .toast {
          position: fixed;
          bottom: 88px;
          left: 16px;
          right: 16px;
          padding: 14px 18px;
          background: #12121f;
          border-left: 4px solid #22c55e;
          border-radius: 12px;
          color: #fff;
          z-index: 200;
          font-size: 13px;
          font-weight: 500;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
          animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          word-break: break-word;
          max-width: 500px;
          margin: 0 auto;
          white-space: pre-line;
        }

        .toast.err { border-color: #ef4444; }

        @keyframes toastIn {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @media (min-width: 768px) {
          .stats-grid { grid-template-columns: repeat(4, 1fr); }
          .list { display: grid; grid-template-columns: repeat(2, 1fr); }
          .btn-row .btn { flex: 0 0 auto; }
          .btn-row .btn:first-child { flex: 1; }
          .overlay { align-items: center; }
          .sheet { border-radius: 24px; padding: 20px 30px 30px; }
        }
      `}</style>
    </>
  );
}

// ==================== PROJECT LIST ====================
function ProjectList({ projects, onCopy, onDelete, onVars }) {
  if (projects.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🔍</div>
        <h3>Koi project match nahi</h3>
      </div>
    );
  }

  return (
    <div className="list">
      {projects.map((p) => (
        <div key={p.id} className="proj-card">
          <div className="proj-head">
            <div className="proj-name">{p.name}</div>
            <span className="chip chip-green">Active</span>
          </div>

          <div className="proj-meta">
            📅 {new Date(p.createdAt).toLocaleDateString('en-IN')} · 🔧{' '}
            {p.services?.length || 0} services
          </div>

          {p.services && p.services.length > 0 && (
            <div className="services">
              {p.services.map((s) => (
                <div key={s.id} className="svc">
                  <span className="svc-name">⚙️ {s.name}</span>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => onVars(p, s)}
                  >
                    🔐 Vars
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="proj-actions">
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
            >
              🔗 Open
            </a>
            <button
              className="btn btn-outline"
              onClick={() => onCopy(p.url, 'Link')}
            >
              📋
            </button>
            <button
              className="btn btn-danger"
              onClick={() => onDelete(p.id, p.name)}
            >
              🗑️
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}