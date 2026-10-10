import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import JSZip from 'jszip';

// ==================== GRAPHQL QUERIES ====================
const Q = {
  testMe: `query { me { id name email } }`,

  getProjectsViaMe: `
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
              services { edges { node { id name } } }
              environments { edges { node { id name } } }
            }
          }
        }
      }
    }
  `,

  getProjectsDirect: `
    query {
      projects {
        edges {
          node {
            id
            name
            createdAt
            services { edges { node { id name } } }
            environments { edges { node { id name } } }
          }
        }
      }
    }
  `,

  getProjectDetails: `
    query($id: String!) {
      project(id: $id) {
        id
        name
        createdAt
        services { edges { node { id name } } }
        environments { edges { node { id name } } }
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
    mutation($projectId: String!, $environmentId: String!, $serviceId: String!, $name: String!, $value: String!) {
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
    mutation($projectId: String!, $environmentId: String!, $serviceId: String!, $name: String!) {
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

  createService: `
    mutation($projectId: String!, $name: String!) {
      serviceCreate(
        input: {
          projectId: $projectId
          name: $name
        }
      ) {
        id
        name
      }
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
  const [detectedTokenType, setDetectedTokenType] = useState(null);

  // GitHub Repos
  const [githubRepos, setGithubRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [repoFilter, setRepoFilter] = useState('all');

  // Modals
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showVarsModal, setShowVarsModal] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCodeEditorModal, setShowCodeEditorModal] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showRepoDeployModal, setShowRepoDeployModal] = useState(false);

  const [debugData, setDebugData] = useState(null);
  const [usageData, setUsageData] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');

  // Selected repo
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [repoBranches, setRepoBranches] = useState([]);
  const [repoFiles, setRepoFiles] = useState([]);
  const [repoDeployConfig, setRepoDeployConfig] = useState({
    projectName: '', branch: '', serviceName: 'web',
    envVars: [{ key: '', value: '' }],
  });

  const [newToken, setNewToken] = useState({
    email: '', token: '', priority: 1, type: 'auto',
  });

  const [newProject, setNewProject] = useState({ name: '' });

  const [githubToken, setGithubToken] = useState('');
  const [githubUser, setGithubUser] = useState(null);

  const [githubDeploy, setGithubDeploy] = useState({
    projectName: '', repoUrl: '', branch: 'main', serviceName: 'web',
    envVars: [{ key: '', value: '' }],
  });

  const [zipDeploy, setZipDeploy] = useState({
    projectName: '', serviceName: 'web', zipFile: null,
    envVars: [{ key: '', value: '' }],
  });
  const zipInputRef = useRef(null);

  const [codeEditor, setCodeEditor] = useState({
    repoName: '', branch: 'main',
    files: [{ path: 'index.html', content: '' }],
    activeFileIndex: 0,
    isPrivate: false,
  });

  const [deploySteps, setDeploySteps] = useState([]);
  const [deploying, setDeploying] = useState(false);

  const [varsContext, setVarsContext] = useState(null);
  const [vars, setVars] = useState({});
  const [varsLoading, setVarsLoading] = useState(false);
  const [newVar, setNewVar] = useState({ name: '', value: '' });
  const [revealed, setRevealed] = useState({});

  // ============ LOAD ============
  useEffect(() => {
    try {
      const t = localStorage.getItem('rw_tokens_v9');
      if (t) { const p = JSON.parse(t); if (Array.isArray(p)) setTokens(p); }
      const pr = localStorage.getItem('rw_projects_v9');
      if (pr) { const p = JSON.parse(pr); if (Array.isArray(p)) setProjects(p); }
      const gh = localStorage.getItem('rw_github_settings_v9');
      if (gh) { const p = JSON.parse(gh); if (p.githubToken) setGithubToken(p.githubToken); }
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (tokens.length) localStorage.setItem('rw_tokens_v9', JSON.stringify(tokens));
    else localStorage.removeItem('rw_tokens_v9');
  }, [tokens]);

  useEffect(() => {
    if (projects.length) localStorage.setItem('rw_projects_v9', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    if (githubToken) {
      localStorage.setItem('rw_github_settings_v9', JSON.stringify({ githubToken }));
      loadGitHubUser();
      loadGitHubRepos();
    }
  }, [githubToken]);

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 4500);
  }, []);

  const setStatusText = (text, type = 'ok') => setStatus({ text, type });

  // ============ API CALLS ============
  const railwayCallOne = async (query, variables = {}, token) => {
    const res = await fetch('/api/railway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query, variables,
        tokens: [{ email: token.email, token: token.token.trim(), priority: 1 }],
      }),
    });
    const data = await res.json();
    if (data.debug) console.log('🔍 Debug:', data.debug);
    if (!res.ok) {
      const errMsg = data.error || 'Unknown error';
      const details = data.details ? '\n\n' + data.details.join('\n') : '';
      throw new Error(errMsg + details);
    }
    return data;
  };

  const railwayCall = async (query, variables = {}) => {
    if (tokens.length === 0) throw new Error('Pehle token add karo!');
    const res = await fetch('/api/railway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query, variables,
        tokens: tokens.map((t) => ({
          email: t.email, token: t.token.trim(), priority: t.priority,
        })),
      }),
    });
    const data = await res.json();
    if (data.debug) { setDebugData(data.debug); console.log('🔍 Debug:', data.debug); }
    if (!res.ok) {
      const errMsg = data.error || 'Unknown error';
      const details = data.details ? '\n\n' + data.details.join('\n') : '';
      throw new Error(errMsg + details);
    }
    return data;
  };

  // ============ LOAD PROJECTS ============
  const loadProjects = async () => {
    if (tokens.length === 0) return showToast('Pehle token add karo!', true);
    setLoading(true);
    setStatusText('Loading...', 'loading');

    const sorted = [...tokens].sort((a, b) => (a.priority || 99) - (b.priority || 99));
    const debugLog = [];

    for (const token of sorted) {
      try {
        const result = await railwayCallOne(Q.getProjectsViaMe, {}, token);
        const edges = result.data?.me?.projects?.edges || [];
        const email = result.data?.me?.email || token.email;
        const list = edges.map((e) => ({
          id: e.node.id, name: e.node.name, createdAt: e.node.createdAt,
          services: e.node.services?.edges?.map((s) => s.node) || [],
          environments: e.node.environments?.edges?.map((en) => en.node) || [],
          url: `https://${e.node.name}.up.railway.app`,
          account: email,
        }));
        setProjects(list);
        setDetectedTokenType('account');
        setStatusText(`✅ Account • ${email} • ${list.length} projects`);
        showToast(`✅ ${list.length} projects loaded`);
        setLoading(false);
        return;
      } catch (err1) {
        debugLog.push({ account: token.email, attempt: 'me.projects', error: err1.message.split('\n')[0] });
      }

      try {
        const result = await railwayCallOne(Q.getProjectsDirect, {}, token);
        const edges = result.data?.projects?.edges || [];
        const list = edges.map((e) => ({
          id: e.node.id, name: e.node.name, createdAt: e.node.createdAt,
          services: e.node.services?.edges?.map((s) => s.node) || [],
          environments: e.node.environments?.edges?.map((en) => en.node) || [],
          url: `https://${e.node.name}.up.railway.app`,
          account: token.email,
        }));
        setProjects(list);
        setDetectedTokenType('workspace');
        setStatusText(`✅ Workspace • ${token.email} • ${list.length} projects`);
        showToast(`✅ ${list.length} projects loaded`);
        setLoading(false);
        return;
      } catch (err2) {
        debugLog.push({ account: token.email, attempt: 'projects', error: err2.message.split('\n')[0] });
      }
    }

    setStatusText('❌ Saare tokens fail', 'error');
    showToast('❌ Koi token kaam nahi kiya', true);
    setDebugData(debugLog);
    setShowDebugModal(true);
    setLoading(false);
  };

  // ============ USAGE ============
  const loadUsage = async () => {
    if (tokens.length === 0) return showToast('Pehle token add karo!', true);
    setLoading(true);
    setStatusText('Loading usage...', 'loading');
    try {
      const sorted = [...tokens].sort((a, b) => (a.priority || 99) - (b.priority || 99));
      let usageResult = null;
      for (const token of sorted) {
        try {
          const sub = await railwayCallOne(`
            query { me { id email name subscription { id plan { id name } currentPeriodEnd } } }
          `, {}, token);
          if (sub.data?.me) {
            usageResult = {
              email: sub.data.me.email,
              name: sub.data.me.name,
              plan: sub.data.me.subscription?.plan?.name || 'Free',
              planId: sub.data.me.subscription?.plan?.id || 'free',
              currentPeriodEnd: sub.data.me.subscription?.currentPeriodEnd,
            };
            break;
          }
        } catch (e) {}
      }
      const projectsCount = projects.length;
      const servicesCount = projects.reduce((s, p) => s + (p.services?.length || 0), 0);
      const FREE_CREDIT = 5.00;
      const FREE_HOURS = 500;
      const usage = {
        ...usageResult, projectsCount, servicesCount,
        freeCredit: FREE_CREDIT, freeHours: FREE_HOURS,
        estimatedHoursUsed: Math.min(servicesCount * 24 * 5, FREE_HOURS),
        estimatedCostPerDay: (servicesCount * 0.000231) * 24,
      };
      setUsageData(usage);
      setShowUsageModal(true);
      setStatusText(`✅ Usage • ${usage.plan}`);
    } catch (err) {
      showToast('❌ ' + err.message.split('\n')[0], true);
    } finally { setLoading(false); }
  };

  // ============ GITHUB ============
  const loadGitHubUser = async () => {
    if (!githubToken) return null;
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github.v3+json' },
      });
      if (res.ok) {
        const user = await res.json();
        setGithubUser(user);
        return user;
      }
    } catch (e) {}
    return null;
  };

  const loadGitHubRepos = async () => {
    if (!githubToken) return;
    setReposLoading(true);
    try {
      const allRepos = [];
      let page = 1;
      while (page <= 5) {
        const res = await fetch(
          `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
          {
            headers: { Authorization: `token ${githubToken}`, Accept: 'application/vnd.github.v3+json' },
          }
        );
        if (!res.ok) throw new Error('GitHub repos fetch fail');
        const repos = await res.json();
        if (repos.length === 0) break;
        allRepos.push(...repos);
        if (repos.length < 100) break;
        page++;
      }
      setGithubRepos(allRepos);
      showToast(`✅ ${allRepos.length} GitHub repos loaded`);
    } catch (err) {
      showToast('❌ ' + err.message, true);
    } finally {
      setReposLoading(false);
    }
  };

  const githubRequest = async (url, options = {}) => {
    if (!githubToken) throw new Error('GitHub token missing');
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `GitHub ${res.status}`);
    }
    return res.json();
  };

  const createGitHubRepo = async (name, isPrivate = false) => {
    return githubRequest('https://api.github.com/user/repos', {
      method: 'POST',
      body: JSON.stringify({ name, private: isPrivate, auto_init: true, description: 'Created via Railway Panel' }),
    });
  };

  const uploadFileToGitHub = async (repoFullName, path, base64Content, branch, message) => {
    let sha = null;
    try {
      const existing = await githubRequest(
        `https://api.github.com/repos/${repoFullName}/contents/${encodeURIComponent(path)}?ref=${branch}`
      );
      sha = existing.sha;
    } catch (e) {}

    return githubRequest(
      `https://api.github.com/repos/${repoFullName}/contents/${encodeURIComponent(path)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          message: message || `Add ${path}`,
          content: base64Content,
          branch,
          ...(sha ? { sha } : {}),
        }),
      }
    );
  };

  // ============ OPEN REPO DETAILS ============
  const openRepoDetails = async (repo) => {
    setSelectedRepo(repo);
    setRepoDeployConfig({
      projectName: repo.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      branch: repo.default_branch || 'main',
      serviceName: 'web',
      envVars: [{ key: '', value: '' }],
    });
    setRepoBranches([]);
    setRepoFiles([]);

    try {
      const branches = await githubRequest(`https://api.github.com/repos/${repo.full_name}/branches?per_page=30`);
      setRepoBranches(branches);
    } catch (e) {}

    try {
      const contents = await githubRequest(`https://api.github.com/repos/${repo.full_name}/contents/`);
      setRepoFiles(contents);
    } catch (e) {}

    setShowRepoDeployModal(true);
  };

  // ============ DEPLOY FROM SELECTED REPO ============
  const deployFromRepo = async () => {
    if (!selectedRepo) return;
    const { projectName, branch, serviceName, envVars } = repoDeployConfig;

    if (!projectName.trim()) return showToast('Project naam daalo!', true);
    if (!/^[a-z0-9-]+$/.test(projectName)) return showToast('Lowercase, numbers, hyphen!', true);

    setDeploying(true);
    setDeploySteps([]);
    setShowRepoDeployModal(false);
    setShowDeployModal(true);

    const addStep = (text, status = 'running') => {
      setDeploySteps((prev) => [...prev, { text, status, time: new Date().toLocaleTimeString() }]);
    };
    const updateLastStep = (status, detail = '') => {
      setDeploySteps((prev) => {
        const copy = [...prev];
        if (copy.length > 0) copy[copy.length - 1] = { ...copy[copy.length - 1], status, detail };
        return copy;
      });
    };

    try {
      addStep(`Deploying from: ${selectedRepo.full_name}`, 'done', `Branch: ${branch}`);

      addStep(`Creating Railway project "${projectName}"...`);
      const projResult = await railwayCall(Q.createProject, { name: projectName });
      const projectId = projResult.data?.projectCreate?.id;
      if (!projectId) throw new Error('Project ID nahi mila');
      updateLastStep('done', `Project: ${projectId.substring(0, 8)}...`);

      addStep('Getting environment...');
      const projDetails = await railwayCall(Q.getProjectDetails, { id: projectId });
      const environments = projDetails.data?.project?.environments?.edges || [];
      if (environments.length === 0) throw new Error('Environment nahi mila');
      const environmentId = environments[0].node.id;
      updateLastStep('done', environments[0].node.name);

      addStep(`Creating service "${serviceName}"...`);
      let serviceId = null;
      try {
        const svcRes = await railwayCall(Q.createService, { projectId, name: serviceName });
        serviceId = svcRes.data?.serviceCreate?.id;
        updateLastStep('done', serviceId ? `${serviceId.substring(0, 8)}...` : 'Created');
      } catch (e) {
        updateLastStep('warn', 'Manual connect karo');
      }

      const validVars = envVars.filter((v) => v.key.trim() && v.value.trim());
      if (validVars.length > 0 && serviceId) {
        addStep(`Setting ${validVars.length} env vars...`);
        for (const v of validVars) {
          try {
            await railwayCall(Q.upsertVariable, {
              projectId, environmentId, serviceId,
              name: v.key.trim().toUpperCase(),
              value: v.value,
            });
          } catch (e) {}
        }
        updateLastStep('done', `${validVars.length} vars set`);
      }

      addStep('✅ Railway project ready!', 'done');
      addStep(`🔗 Ab Railway pe jao aur repo connect karo:`, 'warn');
      addStep(`   ${selectedRepo.html_url}`, 'warn', `Branch: ${branch}`);

      showToast(`🚀 "${projectName}" created! Railway pe repo connect karo.`);
      await loadProjects();
      setSelectedRepo(null);
    } catch (err) {
      addStep(`❌ ${err.message}`, 'error');
      showToast('❌ ' + err.message.split('\n')[0], true);
    } finally {
      setDeploying(false);
    }
  };

  // ============ DEPLOY FROM GITHUB URL ============
  const deployFromGitHub = async () => {
    const { projectName, repoUrl, branch, serviceName, envVars } = githubDeploy;

    if (!projectName.trim()) return showToast('Project naam daalo!', true);
    if (!/^[a-z0-9-]+$/.test(projectName)) return showToast('Lowercase, numbers, hyphen!', true);
    if (!repoUrl.trim()) return showToast('GitHub URL daalo!', true);
    if (!/^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+\/?$/.test(repoUrl.trim())) {
      return showToast('Galat GitHub URL!', true);
    }

    setDeploying(true);
    setDeploySteps([]);
    setShowGitHubModal(false);
    setShowDeployModal(true);

    const addStep = (text, status = 'running') => {
      setDeploySteps((prev) => [...prev, { text, status, time: new Date().toLocaleTimeString() }]);
    };
    const updateLastStep = (status, detail = '') => {
      setDeploySteps((prev) => {
        const copy = [...prev];
        if (copy.length > 0) copy[copy.length - 1] = { ...copy[copy.length - 1], status, detail };
        return copy;
      });
    };

    try {
      addStep(`Creating project "${projectName}"...`);
      const projResult = await railwayCall(Q.createProject, { name: projectName });
      const projectId = projResult.data?.projectCreate?.id;
      updateLastStep('done');

      addStep('Getting environment...');
      const projDetails = await railwayCall(Q.getProjectDetails, { id: projectId });
      const environments = projDetails.data?.project?.environments?.edges || [];
      const environmentId = environments[0]?.node?.id;
      updateLastStep('done');

      addStep(`Creating service "${serviceName}"...`);
      let serviceId = null;
      try {
        const svcRes = await railwayCall(Q.createService, { projectId, name: serviceName });
        serviceId = svcRes.data?.serviceCreate?.id;
        updateLastStep('done');
      } catch (e) { updateLastStep('warn'); }

      const validVars = envVars.filter((v) => v.key.trim() && v.value.trim());
      if (validVars.length > 0 && serviceId) {
        addStep(`Setting ${validVars.length} vars...`);
        for (const v of validVars) {
          try {
            await railwayCall(Q.upsertVariable, {
              projectId, environmentId, serviceId,
              name: v.key.trim().toUpperCase(), value: v.value,
            });
          } catch (e) {}
        }
        updateLastStep('done');
      }

      addStep(`🔗 Repo connect karo: ${repoUrl}`, 'warn');
      addStep('✅ Ready!', 'done');

      showToast(`🚀 "${projectName}" created!`);
      await loadProjects();
      setGithubDeploy({
        projectName: '', repoUrl: '', branch: 'main', serviceName: 'web',
        envVars: [{ key: '', value: '' }],
      });
    } catch (err) {
      addStep(`❌ ${err.message}`, 'error');
      showToast('❌ ' + err.message.split('\n')[0], true);
    } finally {
      setDeploying(false);
    }
  };

  // ============ ZIP UPLOAD ============
  const handleZipSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) setZipDeploy((prev) => ({ ...prev, zipFile: file }));
  };

  const deployFromZip = async () => {
    const { projectName, serviceName, zipFile, envVars } = zipDeploy;

    if (!projectName.trim()) return showToast('Project naam daalo!', true);
    if (!/^[a-z0-9-]+$/.test(projectName)) return showToast('Lowercase, numbers, hyphen!', true);
    if (!zipFile) return showToast('ZIP select karo!', true);
    if (!githubToken) return showToast('GitHub token chahiye', true);

    setDeploying(true);
    setDeploySteps([]);
    setShowUploadModal(false);
    setShowDeployModal(true);

    const addStep = (text, status = 'running') => {
      setDeploySteps((prev) => [...prev, { text, status, time: new Date().toLocaleTimeString() }]);
    };
    const updateLastStep = (status, detail = '') => {
      setDeploySteps((prev) => {
        const copy = [...prev];
        if (copy.length > 0) copy[copy.length - 1] = { ...copy[copy.length - 1], status, detail };
        return copy;
      });
    };

    try {
      addStep('Loading ZIP library...', 'done', 'JSZip ready');

      addStep(`Reading ZIP: ${zipFile.name}`);
      const arrayBuffer = await zipFile.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const fileEntries = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
      updateLastStep('done', `${fileEntries.length} files`);

      const paths = fileEntries.map((p) => p.split('/')[0]);
      const uniqueRoots = [...new Set(paths)];
      let stripRoot = '';
      if (uniqueRoots.length === 1 && fileEntries[0].includes('/')) {
        const rootFolder = uniqueRoots[0];
        if (fileEntries.every((f) => f.startsWith(rootFolder + '/'))) stripRoot = rootFolder + '/';
      }

      addStep(`Creating GitHub repo: ${projectName}`);
      const repo = await createGitHubRepo(projectName, false);
      const repoFullName = repo.full_name;
      const branch = repo.default_branch || 'main';
      updateLastStep('done', `github.com/${repoFullName}`);

      addStep(`Uploading ${fileEntries.length} files...`);
      let uploaded = 0;
      for (const path of fileEntries) {
        let cleanPath = path;
        if (stripRoot && cleanPath.startsWith(stripRoot)) cleanPath = cleanPath.substring(stripRoot.length);
        if (!cleanPath) continue;
        const fileData = zip.files[path];
        const arrayBuf = await fileData.async('arraybuffer');
        const base64 = btoa(new Uint8Array(arrayBuf).reduce((acc, byte) => acc + String.fromCharCode(byte), ''));
        try {
          await uploadFileToGitHub(repoFullName, cleanPath, base64, branch, `Add ${cleanPath}`);
          uploaded++;
        } catch (e) {}
      }
      updateLastStep('done', `${uploaded}/${fileEntries.length}`);

      addStep('Creating Railway project...');
      const projResult = await railwayCall(Q.createProject, { name: projectName });
      const projectId = projResult.data?.projectCreate?.id;
      updateLastStep('done');

      addStep('Getting environment...');
      const projDetails = await railwayCall(Q.getProjectDetails, { id: projectId });
      const environments = projDetails.data?.project?.environments?.edges || [];
      const environmentId = environments[0]?.node?.id;
      updateLastStep('done');

      addStep('Creating service...');
      let serviceId = null;
      try {
        const svcRes = await railwayCall(Q.createService, { projectId, name: serviceName || 'web' });
        serviceId = svcRes.data?.serviceCreate?.id;
        updateLastStep('done');
      } catch (e) { updateLastStep('warn'); }

      const validVars = envVars.filter((v) => v.key.trim() && v.value.trim());
      if (validVars.length > 0 && serviceId) {
        addStep(`Setting ${validVars.length} vars...`);
        for (const v of validVars) {
          try {
            await railwayCall(Q.upsertVariable, {
              projectId, environmentId, serviceId,
              name: v.key.trim().toUpperCase(), value: v.value,
            });
          } catch (e) {}
        }
        updateLastStep('done');
      }

      addStep('✅ Deploy complete!', 'done', `github.com/${repoFullName}`);
      showToast(`🚀 "${projectName}" deployed!`);
      await loadProjects();

      setZipDeploy({ projectName: '', serviceName: 'web', zipFile: null, envVars: [{ key: '', value: '' }] });
      if (zipInputRef.current) zipInputRef.current.value = '';
    } catch (err) {
      addStep(`❌ ${err.message}`, 'error');
      showToast('❌ ' + err.message.split('\n')[0], true);
    } finally { setDeploying(false); }
  };

  // ============ CODE EDITOR ============
  const addEditorFile = () => {
    setCodeEditor((prev) => ({
      ...prev, files: [...prev.files, { path: '', content: '' }], activeFileIndex: prev.files.length,
    }));
  };
  const removeEditorFile = (index) => {
    setCodeEditor((prev) => {
      const files = prev.files.filter((_, i) => i !== index);
      return {
        ...prev,
        files: files.length ? files : [{ path: 'index.html', content: '' }],
        activeFileIndex: Math.max(0, Math.min(prev.activeFileIndex, files.length - 1)),
      };
    });
  };
  const updateEditorFile = (index, field, value) => {
    setCodeEditor((prev) => {
      const files = [...prev.files];
      files[index] = { ...files[index], [field]: value };
      return { ...prev, files };
    });
  };

  const deployFromEditor = async () => {
    const { repoName, files, isPrivate } = codeEditor;
    if (!repoName.trim()) return showToast('Repo naam daalo!', true);
    if (!/^[a-z0-9-_]+$/i.test(repoName)) return showToast('Letters, numbers, -, _ only!', true);
    if (!githubToken) return showToast('GitHub token chahiye', true);

    const validFiles = files.filter((f) => f.path.trim() && f.content.trim());
    if (validFiles.length === 0) return showToast('Kam se kam ek file bharo!', true);

    setDeploying(true);
    setDeploySteps([]);
    setShowCodeEditorModal(false);
    setShowDeployModal(true);

    const addStep = (text, status = 'running') => {
      setDeploySteps((prev) => [...prev, { text, status, time: new Date().toLocaleTimeString() }]);
    };
    const updateLastStep = (status, detail = '') => {
      setDeploySteps((prev) => {
        const copy = [...prev];
        if (copy.length > 0) copy[copy.length - 1] = { ...copy[copy.length - 1], status, detail };
        return copy;
      });
    };

    try {
      addStep(`Creating GitHub repo: ${repoName}`);
      const repo = await createGitHubRepo(repoName, isPrivate);
      const repoFullName = repo.full_name;
      const defaultBranch = repo.default_branch || 'main';
      updateLastStep('done', `github.com/${repoFullName}`);

      addStep(`Uploading ${validFiles.length} files...`);
      let uploaded = 0;
      for (const f of validFiles) {
        const base64 = btoa(unescape(encodeURIComponent(f.content)));
        try {
          await uploadFileToGitHub(repoFullName, f.path.trim(), base64, defaultBranch, `Add ${f.path}`);
          uploaded++;
        } catch (e) {}
      }
      updateLastStep('done', `${uploaded}/${validFiles.length}`);

      addStep('Creating Railway project...');
      const projResult = await railwayCall(Q.createProject, { name: repoName.toLowerCase().replace(/[^a-z0-9-]/g, '-') });
      const projectId = projResult.data?.projectCreate?.id;
      updateLastStep('done');

      addStep('Getting environment...');
      const projDetails = await railwayCall(Q.getProjectDetails, { id: projectId });
      const environments = projDetails.data?.project?.environments?.edges || [];
      const environmentId = environments[0]?.node?.id;
      updateLastStep('done');

      addStep('Creating service...');
      try {
        await railwayCall(Q.createService, { projectId, name: 'web' });
        updateLastStep('done');
      } catch (e) { updateLastStep('warn'); }

      addStep('✅ Complete!', 'done', `github.com/${repoFullName}`);
      showToast(`🚀 "${repoName}" deployed!`);
      await loadProjects();

      setCodeEditor({ repoName: '', branch: 'main', files: [{ path: 'index.html', content: '' }], activeFileIndex: 0, isPrivate: false });
    } catch (err) {
      addStep(`❌ ${err.message}`, 'error');
      showToast('❌ ' + err.message.split('\n')[0], true);
    } finally { setDeploying(false); }
  };

  // ============ TEST TOKEN ============
  const testTokens = async () => {
    if (tokens.length === 0) return showToast('Pehle token add karo!', true);
    setLoading(true);
    setStatusText('Testing...', 'loading');
    const results = [];
    for (const token of tokens.sort((a, b) => a.priority - b.priority)) {
      try {
        const r1 = await railwayCallOne(Q.testMe, {}, token);
        if (r1.data?.me) {
          results.push({ email: token.email, type: 'account', status: '✅ Account Token', detail: r1.data.me.email });
          continue;
        }
      } catch (e) {}
      try {
        const r2 = await railwayCallOne(Q.getProjectsDirect, {}, token);
        if (r2.data?.projects) {
          results.push({ email: token.email, type: 'workspace', status: '✅ Workspace Token', detail: `${r2.data.projects.edges.length} projects` });
          continue;
        }
      } catch (e) {}
      results.push({ email: token.email, type: 'fail', status: '❌ Fail', detail: 'Invalid' });
    }
    const success = results.find((r) => r.status.includes('✅'));
    if (success) { showToast(`✅ ${success.status}`); setStatusText(`✅ ${success.status}`); }
    else { showToast('❌ Sab fail', true); setStatusText('❌ Token galat', 'error'); }
    setDebugData(results); setShowDebugModal(true); setLoading(false);
  };

  // ============ TOKENS ============
  const addToken = () => {
    const { email, token, priority, type } = newToken;
    const trimmedToken = token.trim();
    if (!email.trim() || !trimmedToken) return showToast('Naam + token chahiye!', true);
    if (trimmedToken.length < 20) return showToast('Token chhota!', true);
    if (/\s/.test(trimmedToken)) return showToast('Token me space hai!', true);

    const newT = {
      id: 'tok_' + Date.now(), email: email.trim(), name: email.trim(),
      token: trimmedToken, priority: parseInt(priority) || tokens.length + 1,
      type: type || 'auto', addedAt: new Date().toISOString(),
    };
    setTokens([...tokens, newT].sort((a, b) => a.priority - b.priority));
    setNewToken({ email: '', token: '', priority: tokens.length + 2, type: 'auto' });
    setShowTokenModal(false);
    showToast('✅ Token add!');
  };

  const deleteToken = (id) => {
    if (!confirm('Delete?')) return;
    setTokens(tokens.filter((t) => t.id !== id));
    showToast('🗑️');
  };

  // ============ PROJECT CRUD ============
  const createEmptyProject = async () => {
    const { name } = newProject;
    if (!name.trim()) return showToast('Naam daalo!', true);
    if (!/^[a-z0-9-]+$/.test(name)) return showToast('Lowercase only!', true);
    setLoading(true);
    try {
      await railwayCall(Q.createProject, { name });
      showToast('🚀 Project banaya!');
      setNewProject({ name: '' });
      setShowProjectModal(false);
      await loadProjects();
    } catch (err) { showToast('❌ ' + err.message.split('\n')[0], true); }
    finally { setLoading(false); }
  };

  const deleteProject = async (id, name) => {
    if (!confirm(`"${name}" delete?`)) return;
    setLoading(true);
    try {
      await railwayCall(Q.deleteProject, { id });
      showToast('🗑️');
      await loadProjects();
    } catch (err) { showToast('❌ ' + err.message.split('\n')[0], true); }
    finally { setLoading(false); }
  };

  // ============ VARIABLES ============
  const openVars = async (project, service) => {
    if (!project.environments || project.environments.length === 0) return showToast('Environment nahi mila', true);
    const env = project.environments[0];
    setVarsContext({ project, service, environment: env });
    setShowVarsModal(true);
    setVars({}); setRevealed({});
    await loadVars(project.id, env.id, service.id);
  };

  const loadVars = async (projectId, environmentId, serviceId) => {
    setVarsLoading(true);
    try {
      const result = await railwayCall(Q.getServiceVariables, { projectId, environmentId, serviceId });
      setVars(result.data?.variables || {});
    } catch (err) { showToast('❌ ' + err.message.split('\n')[0], true); }
    finally { setVarsLoading(false); }
  };

  const upsertVariable = async () => {
    if (!newVar.name.trim()) return showToast('Naam daalo!', true);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newVar.name)) return showToast('Letter ya _ se shuru!', true);
    try {
      await railwayCall(Q.upsertVariable, {
        projectId: varsContext.project.id, environmentId: varsContext.environment.id,
        serviceId: varsContext.service.id, name: newVar.name, value: newVar.value,
      });
      showToast('✅ Save!');
      setNewVar({ name: '', value: '' });
      await loadVars(varsContext.project.id, varsContext.environment.id, varsContext.service.id);
    } catch (err) { showToast('❌ ' + err.message.split('\n')[0], true); }
  };

  const deleteVariable = async (name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await railwayCall(Q.deleteVariable, {
        projectId: varsContext.project.id, environmentId: varsContext.environment.id,
        serviceId: varsContext.service.id, name,
      });
      showToast('🗑️');
      await loadVars(varsContext.project.id, varsContext.environment.id, varsContext.service.id);
    } catch (err) { showToast('❌ ' + err.message.split('\n')[0], true); }
  };

  const toggleReveal = (key) => setRevealed((r) => ({ ...r, [key]: !r[key] }));
  const copyText = (text, label = 'Text') => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => showToast(`📋 ${label} copy!`),
        () => showToast('Copy fail', true)
      );
    }
  };

  // ============ FILTERS ============
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  
  const filteredRepos = githubRepos.filter((r) => {
    const matchSearch = r.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
                        (r.description && r.description.toLowerCase().includes(repoSearch.toLowerCase()));
    const matchFilter = repoFilter === 'all' || 
                        (repoFilter === 'public' && !r.private) ||
                        (repoFilter === 'private' && r.private);
    return matchSearch && matchFilter;
  });

  const stats = {
    tokens: tokens.length,
    projects: projects.length,
    services: projects.reduce((s, p) => s + (p.services?.length || 0), 0),
    repos: githubRepos.length,
  };

  // ============ RENDER ============
  return (
    <>
      <Head>
        <title>🚂 Railway Panel</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#05050a" />
      </Head>

      <div className="app">
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
          <button className="settings-btn" onClick={() => setShowSettingsModal(true)} title="Settings">⚙️</button>
        </header>

        <main className="main">
          {/* ============ DASHBOARD ============ */}
          {activeTab === 'dashboard' && (
            <>
              <div className="stats-grid">
                <div className="stat"><div className="num">{stats.tokens}</div><div className="lbl">Tokens</div></div>
                <div className="stat"><div className="num">{stats.projects}</div><div className="lbl">Projects</div></div>
                <div className="stat"><div className="num">{stats.services}</div><div className="lbl">Services</div></div>
                <div className="stat"><div className="num">{stats.repos}</div><div className="lbl">Repos</div></div>
              </div>

              {detectedTokenType && (
                <div className="info" style={{
                  background: detectedTokenType === 'account' ? 'rgba(34,197,94,0.08)' : 'rgba(168,85,247,0.08)',
                  borderColor: detectedTokenType === 'account' ? 'rgba(34,197,94,0.25)' : 'rgba(168,85,247,0.25)',
                  color: detectedTokenType === 'account' ? '#86efac' : '#d8b4fe',
                }}>
                  {detectedTokenType === 'account' ? '👤 Account Token' : '👥 Workspace Token'}
                </div>
              )}

              <div className="btn-row">
                <button className="btn btn-primary" onClick={loadProjects} disabled={loading}>
                  {loading ? '⏳' : '🔄'} Refresh
                </button>
                <button className="btn btn-warning" onClick={testTokens} disabled={loading || tokens.length === 0}>🧪 Test</button>
                <button className="btn btn-info" onClick={loadUsage} disabled={loading || tokens.length === 0}>💰 Usage</button>
              </div>

              <div className="deploy-section">
                <div className="deploy-title">🚀 Deploy Karo</div>
                <div className="deploy-btns">
                  <button className="deploy-card" onClick={() => {
                    if (githubRepos.length === 0) {
                      showToast('Pehle GitHub token add karo (⚙️)', true);
                      setShowSettingsModal(true);
                    } else {
                      setActiveTab('repos');
                    }
                  }}>
                    <span className="deploy-icon">🐙</span>
                    <span className="deploy-name">My Repos</span>
                    <span className="deploy-desc">{githubRepos.length} repos</span>
                  </button>
                  <button className="deploy-card" onClick={() => setShowUploadModal(true)}>
                    <span className="deploy-icon">🗜️</span>
                    <span className="deploy-name">ZIP Upload</span>
                    <span className="deploy-desc">Zip file</span>
                  </button>
                  <button className="deploy-card" onClick={() => setShowCodeEditorModal(true)}>
                    <span className="deploy-icon">📝</span>
                    <span className="deploy-name">Code Editor</span>
                    <span className="deploy-desc">Likho & deploy</span>
                  </button>
                </div>
              </div>

              {tokens.length === 0 && (
                <div className="info">💡 Pehle <b>➕ Token</b> dabao. Phir deploy karo.</div>
              )}

              {projects.length > 0 && (
                <>
                  <input type="text" className="search" placeholder="🔍 Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  <ProjectList projects={filtered} onCopy={copyText} onDelete={deleteProject} onVars={openVars} onPreview={(url) => { setPreviewUrl(url); setShowPreviewModal(true); }} />
                </>
              )}

              {projects.length === 0 && tokens.length > 0 && !loading && (
                <div className="empty">
                  <div className="empty-icon">📦</div>
                  <h3>Koi project nahi</h3>
                  <p>Upar se deploy karo</p>
                </div>
              )}
            </>
          )}

          {/* ============ TOKENS ============ */}
          {activeTab === 'tokens' && (
            <>
              <div className="btn-row">
                <button className="btn btn-success btn-full" onClick={() => setShowTokenModal(true)}>➕ Naya Token</button>
              </div>
              <div className="info">
                🔑 Railway → Account Settings → Tokens
                <br /><b>No workspace</b> = Account · <b>My Projects</b> = Workspace
              </div>
              {tokens.length === 0 ? (
                <div className="empty"><div className="empty-icon">🔑</div><h3>Koi token nahi</h3></div>
              ) : (
                <div className="list">
                  {tokens.map((t, i) => (
                    <div key={t.id} className="token-item">
                      <div className="token-head">
                        <span className="token-name">{t.email}</span>
                        {i === 0 && <span className="chip chip-green">Primary</span>}
                      </div>
                      <div className="token-meta">
                        <span className="chip">P{t.priority}</span>
                        <span className="chip chip-purple">{t.token.length} chars</span>
                      </div>
                      <div className="token-value">{t.token.substring(0, 16)}...{t.token.slice(-8)}</div>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteToken(t.id)}>🗑️ Delete</button>
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
                <button className="btn btn-primary" onClick={loadProjects} disabled={loading}>🔄 Refresh</button>
                <button className="btn btn-success" onClick={() => setShowProjectModal(true)}>➕ New</button>
              </div>
              {projects.length > 0 && (
                <input type="text" className="search" placeholder="🔍 Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
              )}
              {projects.length === 0 ? (
                <div className="empty"><div className="empty-icon">📦</div><h3>Koi project nahi</h3></div>
              ) : (
                <ProjectList projects={filtered} onCopy={copyText} onDelete={deleteProject} onVars={openVars} onPreview={(url) => { setPreviewUrl(url); setShowPreviewModal(true); }} />
              )}
            </>
          )}

          {/* ============ GITHUB REPOS ============ */}
          {activeTab === 'repos' && (
            <>
              {!githubToken ? (
                <div className="empty">
                  <div className="empty-icon">🐙</div>
                  <h3>GitHub Token Chahiye</h3>
                  <p style={{ marginBottom: '16px' }}>Repos dekhne ke liye GitHub token add karo</p>
                  <button className="btn btn-primary" onClick={() => setShowSettingsModal(true)}>⚙️ Settings Kholo</button>
                </div>
              ) : (
                <>
                  <div className="btn-row">
                    <button className="btn btn-primary" onClick={loadGitHubRepos} disabled={reposLoading}>
                      {reposLoading ? '⏳' : '🔄'} Repos
                    </button>
                    <button className="btn btn-success" onClick={() => { setCodeEditor({ ...codeEditor, repoName: '' }); setShowCodeEditorModal(true); }}>
                      ➕ New Repo
                    </button>
                  </div>

                  {githubUser && (
                    <div className="github-user-bar">
                      <img src={githubUser.avatar_url} alt="" className="github-avatar" />
                      <div className="github-user-info">
                        <div className="github-user-name">{githubUser.name || githubUser.login}</div>
                        <div className="github-user-login">@{githubUser.login}</div>
                      </div>
                      <div className="github-repo-count">{githubRepos.length} repos</div>
                    </div>
                  )}

                  <input
                    type="text"
                    className="search"
                    placeholder="🔍 Repo search..."
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                  />

                  <div className="filter-tabs">
                    <button className={`filter-tab ${repoFilter === 'all' ? 'active' : ''}`} onClick={() => setRepoFilter('all')}>
                      All ({githubRepos.length})
                    </button>
                    <button className={`filter-tab ${repoFilter === 'public' ? 'active' : ''}`} onClick={() => setRepoFilter('public')}>
                      🌐 Public ({githubRepos.filter(r => !r.private).length})
                    </button>
                    <button className={`filter-tab ${repoFilter === 'private' ? 'active' : ''}`} onClick={() => setRepoFilter('private')}>
                      🔒 Private ({githubRepos.filter(r => r.private).length})
                    </button>
                  </div>

                  {reposLoading ? (
                    <div className="empty"><div className="empty-icon">⏳</div><h3>Loading repos...</h3></div>
                  ) : filteredRepos.length === 0 ? (
                    <div className="empty">
                      <div className="empty-icon">📭</div>
                      <h3>Koi repo nahi mila</h3>
                    </div>
                  ) : (
                    <div className="repo-list">
                      {filteredRepos.map((r) => (
                        <div key={r.id} className="repo-card" onClick={() => openRepoDetails(r)}>
                          <div className="repo-head">
                            <div className="repo-icon">{r.private ? '🔒' : '📂'}</div>
                            <div className="repo-info">
                              <div className="repo-name">{r.name}</div>
                              <div className="repo-full">{r.full_name}</div>
                            </div>
                            <button
                              className="btn btn-success btn-sm repo-deploy-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                openRepoDetails(r);
                              }}
                            >
                              🚀 Deploy
                            </button>
                          </div>
                          {r.description && <div className="repo-desc">{r.description}</div>}
                          <div className="repo-meta">
                            {r.language && <span className="chip chip-purple">{r.language}</span>}
                            <span className="chip chip-blue">⭐ {r.stargazers_count}</span>
                            <span className="chip">🍴 {r.forks_count}</span>
                            <span className="chip">📅 {new Date(r.updated_at).toLocaleDateString('en-IN')}</span>
                            {r.private && <span className="chip chip-green">Private</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>

        {/* BOTTOM NAV */}
        <nav className="bottom-nav">
          <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <span className="nav-icon">📊</span><span className="nav-label">Home</span>
          </button>
          <button className={`nav-item ${activeTab === 'tokens' ? 'active' : ''}`} onClick={() => setActiveTab('tokens')}>
            <span className="nav-icon">🔑</span><span className="nav-label">Tokens</span>
          </button>
          <button className={`nav-item ${activeTab === 'projects' ? 'active' : ''}`} onClick={() => setActiveTab('projects')}>
            <span className="nav-icon">📦</span><span className="nav-label">Projects</span>
          </button>
          <button className={`nav-item ${activeTab === 'repos' ? 'active' : ''}`} onClick={() => setActiveTab('repos')}>
            <span className="nav-icon">🐙</span><span className="nav-label">Repos</span>
          </button>
        </nav>

        {/* ============ TOKEN MODAL ============ */}
        {showTokenModal && (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowTokenModal(false)}>
            <div className="sheet">
              <div className="sheet-handle" />
              <h2>🔑 Naya Token</h2>
              <p className="hint">Railway → Account Settings → Tokens</p>
              <label>Naam / Email</label>
              <input type="text" placeholder="my-account" value={newToken.email} onChange={(e) => setNewToken({ ...newToken, email: e.target.value })} />
              <label>Type</label>
              <select value={newToken.type} onChange={(e) => setNewToken({ ...newToken, type: e.target.value })}>
                <option value="auto">🔄 Auto-detect</option>
                <option value="account">👤 Account</option>
                <option value="workspace">👥 Workspace</option>
              </select>
              <label>Token (UUID)</label>
              <input type="text" placeholder="47d0d096-..." value={newToken.token} onChange={(e) => setNewToken({ ...newToken, token: e.target.value })} />
              <label>Priority</label>
              <input type="number" min="1" value={newToken.priority} onChange={(e) => setNewToken({ ...newToken, priority: e.target.value })} />
              <div className="sheet-actions">
                <button className="btn btn-outline" onClick={() => setShowTokenModal(false)}>Cancel</button>
                <button className="btn btn-success" onClick={addToken}>✅ Add</button>
              </div>
            </div>
          </div>
        )}

        {/* ============ SETTINGS MODAL ============ */}
        {showSettingsModal && (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowSettingsModal(false)}>
            <div className="sheet">
              <div className="sheet-handle" />
              <h2>⚙️ Settings</h2>
              <label>GitHub Token (ghp_...)</label>
              <input type="password" placeholder="ghp_xxxxx" value={githubToken} onChange={(e) => setGithubToken(e.target.value)} />
              <p className="hint" style={{ marginTop: '8px' }}>
                GitHub → Settings → Developer settings → Tokens (classic) → <b>repo</b> scope
              </p>
              {githubUser && (
                <div className="info" style={{ marginTop: '12px' }}>
                  ✅ Connected: <b>{githubUser.login}</b> • {githubRepos.length} repos
                </div>
              )}
              <div className="sheet-actions">
                <button className="btn btn-outline" onClick={() => setShowSettingsModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* ============ REPO DEPLOY MODAL ============ */}
        {showRepoDeployModal && selectedRepo && (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowRepoDeployModal(false)}>
            <div className="sheet sheet-large">
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div>
                  <h2>🚀 Deploy Repo</h2>
                  <p className="hint">{selectedRepo.full_name}</p>
                </div>
                <button className="close-btn" onClick={() => setShowRepoDeployModal(false)}>✕</button>
              </div>

              <div className="repo-detail-card">
                <div className="repo-detail-row">
                  <span className="repo-detail-label">Repo:</span>
                  <span className="repo-detail-val">{selectedRepo.name}</span>
                </div>
                <div className="repo-detail-row">
                  <span className="repo-detail-label">Owner:</span>
                  <span className="repo-detail-val">{selectedRepo.owner.login}</span>
                </div>
                <div className="repo-detail-row">
                  <span className="repo-detail-label">Visibility:</span>
                  <span className="repo-detail-val">{selectedRepo.private ? '🔒 Private' : '🌐 Public'}</span>
                </div>
                {selectedRepo.language && (
                  <div className="repo-detail-row">
                    <span className="repo-detail-label">Language:</span>
                    <span className="repo-detail-val">{selectedRepo.language}</span>
                  </div>
                )}
                <div className="repo-detail-row">
                  <span className="repo-detail-label">Updated:</span>
                  <span className="repo-detail-val">{new Date(selectedRepo.updated_at).toLocaleDateString('en-IN')}</span>
                </div>
              </div>

              {repoFiles.length > 0 && (
                <div className="repo-files-preview">
                  <div className="repo-files-title">📁 Root Files ({repoFiles.length})</div>
                  <div className="repo-files-list">
                    {repoFiles.slice(0, 8).map((f, i) => (
                      <span key={i} className="repo-file-chip">
                        {f.type === 'dir' ? '📁' : '📄'} {f.name}
                      </span>
                    ))}
                    {repoFiles.length > 8 && (
                      <span className="repo-file-chip">+{repoFiles.length - 8} more</span>
                    )}
                  </div>
                </div>
              )}

              <label>Project Name *</label>
              <input
                type="text"
                placeholder="my-app"
                value={repoDeployConfig.projectName}
                onChange={(e) => setRepoDeployConfig({ ...repoDeployConfig, projectName: e.target.value })}
              />

              <label>Branch</label>
              <select
                value={repoDeployConfig.branch}
                onChange={(e) => setRepoDeployConfig({ ...repoDeployConfig, branch: e.target.value })}
              >
                {repoBranches.length > 0 ? (
                  repoBranches.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))
                ) : (
                  <option value={selectedRepo.default_branch || 'main'}>
                    {selectedRepo.default_branch || 'main'}
                  </option>
                )}
              </select>

              <label>Service Name</label>
              <input
                type="text"
                placeholder="web"
                value={repoDeployConfig.serviceName}
                onChange={(e) => setRepoDeployConfig({ ...repoDeployConfig, serviceName: e.target.value })}
              />

              <label>Env Variables (optional)</label>
              {repoDeployConfig.envVars.map((env, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    placeholder="KEY"
                    value={env.key}
                    onChange={(e) => {
                      const copy = [...repoDeployConfig.envVars];
                      copy[i] = { ...copy[i], key: e.target.value.toUpperCase() };
                      setRepoDeployConfig({ ...repoDeployConfig, envVars: copy });
                    }}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="text"
                    placeholder="value"
                    value={env.value}
                    onChange={(e) => {
                      const copy = [...repoDeployConfig.envVars];
                      copy[i] = { ...copy[i], value: e.target.value };
                      setRepoDeployConfig({ ...repoDeployConfig, envVars: copy });
                    }}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="icon-btn"
                    onClick={() => {
                      const copy = repoDeployConfig.envVars.filter((_, idx) => idx !== i);
                      setRepoDeployConfig({ ...repoDeployConfig, envVars: copy.length ? copy : [{ key: '', value: '' }] });
                    }}
                    style={{ width: '44px', flexShrink: 0 }}
                  >🗑️</button>
                </div>
              ))}
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setRepoDeployConfig({ ...repoDeployConfig, envVars: [...repoDeployConfig.envVars, { key: '', value: '' }] })}
              >
                ➕ Add Env
              </button>

              <div className="sheet-actions" style={{ marginTop: '24px' }}>
                <button className="btn btn-outline" onClick={() => setShowRepoDeployModal(false)}>Cancel</button>
                <button className="btn btn-success" onClick={deployFromRepo} disabled={deploying}>
                  {deploying ? '⏳' : '🚀'} Deploy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ ZIP UPLOAD MODAL ============ */}
        {showUploadModal && (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowUploadModal(false)}>
            <div className="sheet sheet-large">
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div><h2>🗜️ ZIP Upload</h2><p className="hint">ZIP → GitHub → Railway deploy</p></div>
                <button className="close-btn" onClick={() => setShowUploadModal(false)}>✕</button>
              </div>
              {!githubToken && (
                <div className="info" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                  ⚠️ Pehle GitHub Token add karo (⚙️)
                </div>
              )}
              <label>Project Name *</label>
              <input type="text" placeholder="my-app" value={zipDeploy.projectName} onChange={(e) => setZipDeploy({ ...zipDeploy, projectName: e.target.value })} />
              <label>Service Name</label>
              <input type="text" placeholder="web" value={zipDeploy.serviceName} onChange={(e) => setZipDeploy({ ...zipDeploy, serviceName: e.target.value })} />
              <label>ZIP File *</label>
              <input ref={zipInputRef} type="file" accept=".zip" onChange={handleZipSelect} style={{ padding: '10px', background: '#0a0a0f', borderRadius: '10px', border: '1px dashed #a855f7', cursor: 'pointer' }} />
              {zipDeploy.zipFile && (
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
                  📦 {zipDeploy.zipFile.name} ({(zipDeploy.zipFile.size / 1024).toFixed(1)} KB)
                </div>
              )}
              <label>Env Variables</label>
              {zipDeploy.envVars.map((env, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input type="text" placeholder="KEY" value={env.key} onChange={(e) => {
                    const copy = [...zipDeploy.envVars];
                    copy[i] = { ...copy[i], key: e.target.value.toUpperCase() };
                    setZipDeploy({ ...zipDeploy, envVars: copy });
                  }} style={{ flex: 1 }} />
                  <input type="text" placeholder="value" value={env.value} onChange={(e) => {
                    const copy = [...zipDeploy.envVars];
                    copy[i] = { ...copy[i], value: e.target.value };
                    setZipDeploy({ ...zipDeploy, envVars: copy });
                  }} style={{ flex: 1 }} />
                  <button className="icon-btn" onClick={() => {
                    const copy = zipDeploy.envVars.filter((_, idx) => idx !== i);
                    setZipDeploy({ ...zipDeploy, envVars: copy.length ? copy : [{ key: '', value: '' }] });
                  }} style={{ width: '44px', flexShrink: 0 }}>🗑️</button>
                </div>
              ))}
              <button className="btn btn-outline btn-sm" onClick={() => setZipDeploy({ ...zipDeploy, envVars: [...zipDeploy.envVars, { key: '', value: '' }] })}>➕ Add Env</button>
              <div className="sheet-actions" style={{ marginTop: '24px' }}>
                <button className="btn btn-outline" onClick={() => setShowUploadModal(false)}>Cancel</button>
                <button className="btn btn-success" onClick={deployFromZip} disabled={deploying || !githubToken}>{deploying ? '⏳' : '🚀'} Upload & Deploy</button>
              </div>
            </div>
          </div>
        )}

        {/* ============ CODE EDITOR MODAL ============ */}
        {showCodeEditorModal && (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowCodeEditorModal(false)}>
            <div className="sheet sheet-large" style={{ maxWidth: '900px' }}>
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div><h2>📝 Code Editor</h2><p className="hint">Files banao, code likho, deploy</p></div>
                <button className="close-btn" onClick={() => setShowCodeEditorModal(false)}>✕</button>
              </div>
              {!githubToken && (
                <div className="info" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                  ⚠️ GitHub Token chahiye (⚙️)
                </div>
              )}
              <label>Repo Name *</label>
              <input type="text" placeholder="my-website" value={codeEditor.repoName} onChange={(e) => setCodeEditor({ ...codeEditor, repoName: e.target.value })} />
              <label>Private Repo?</label>
              <select value={codeEditor.isPrivate ? 'yes' : 'no'} onChange={(e) => setCodeEditor({ ...codeEditor, isPrivate: e.target.value === 'yes' })}>
                <option value="no">🌐 Public</option>
                <option value="yes">🔒 Private</option>
              </select>
              <label>Files ({codeEditor.files.length})</label>
              <div className="editor-tabs">
                {codeEditor.files.map((f, i) => (
                  <button key={i} className={`editor-tab ${i === codeEditor.activeFileIndex ? 'active' : ''}`} onClick={() => setCodeEditor({ ...codeEditor, activeFileIndex: i })}>
                    {f.path || 'untitled'}
                  </button>
                ))}
                <button className="editor-tab add" onClick={addEditorFile}>➕</button>
              </div>
              <div style={{ marginTop: '10px' }}>
                <input
                  type="text"
                  placeholder="file path (e.g., index.html)"
                  value={codeEditor.files[codeEditor.activeFileIndex]?.path || ''}
                  onChange={(e) => updateEditorFile(codeEditor.activeFileIndex, 'path', e.target.value)}
                  style={{ marginBottom: '8px' }}
                />
                <textarea
                  placeholder="Paste your code here..."
                  value={codeEditor.files[codeEditor.activeFileIndex]?.content || ''}
                  onChange={(e) => updateEditorFile(codeEditor.activeFileIndex, 'content', e.target.value)}
                  style={{ width: '100%', minHeight: '220px', padding: '12px', background: '#0a0a0f', border: '1px solid #2a2a4a', borderRadius: '12px', color: '#fff', fontFamily: 'Courier New, monospace', fontSize: '13px', resize: 'vertical' }}
                />
                <button className="btn btn-danger btn-sm" onClick={() => removeEditorFile(codeEditor.activeFileIndex)} style={{ marginTop: '6px' }}>🗑️ Delete File</button>
              </div>
              <div className="sheet-actions" style={{ marginTop: '20px' }}>
                <button className="btn btn-outline" onClick={() => setShowCodeEditorModal(false)}>Cancel</button>
                <button className="btn btn-success" onClick={deployFromEditor} disabled={deploying || !githubToken}>{deploying ? '⏳' : '🚀'} Deploy</button>
              </div>
            </div>
          </div>
        )}

        {/* ============ USAGE MODAL ============ */}
        {showUsageModal && usageData && (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowUsageModal(false)}>
            <div className="sheet sheet-large">
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div><h2>💰 Railway Usage</h2><p className="hint">{usageData.email}</p></div>
                <button className="close-btn" onClick={() => setShowUsageModal(false)}>✕</button>
              </div>
              <div className="usage-grid">
                <div className="usage-card"><div className="usage-label">Plan</div><div className="usage-value">{usageData.plan || 'Free'}</div></div>
                <div className="usage-card"><div className="usage-label">Free Credit</div><div className="usage-value">${usageData.freeCredit.toFixed(2)}</div></div>
                <div className="usage-card"><div className="usage-label">Projects</div><div className="usage-value">{usageData.projectsCount}</div></div>
                <div className="usage-card"><div className="usage-label">Services</div><div className="usage-value">{usageData.servicesCount}</div></div>
                <div className="usage-card"><div className="usage-label">Hours / mo</div><div className="usage-value">{usageData.freeHours}h</div></div>
                <div className="usage-card"><div className="usage-label">Est. Used</div><div className="usage-value">~{usageData.estimatedHoursUsed}h</div></div>
              </div>
              <div className="info" style={{ marginTop: '16px' }}>
                ⚠️ <b>Note:</b> Railway exact dollar GraphQL API me nahi deta. Ye estimate hai.
                <br /><br />Exact dekhne ke liye: <b>railway.app → Account Settings → Usage</b>
              </div>
              <div className="sheet-actions" style={{ marginTop: '20px' }}>
                <a href="https://railway.app/account/usage" target="_blank" rel="noreferrer" className="btn btn-primary" style={{ flex: 1, textAlign: 'center' }}>🔗 Railway Usage</a>
                <button className="btn btn-outline" onClick={() => setShowUsageModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* ============ PREVIEW MODAL ============ */}
        {showPreviewModal && previewUrl && (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowPreviewModal(false)}>
            <div className="sheet sheet-large" style={{ maxWidth: '900px', height: '85vh', padding: '8px' }}>
              <div className="sheet-handle" />
              <div className="sheet-head" style={{ padding: '0 12px' }}>
                <div><h2>🌐 Preview</h2><p className="hint">{previewUrl}</p></div>
                <button className="close-btn" onClick={() => setShowPreviewModal(false)}>✕</button>
              </div>
              <iframe src={previewUrl} style={{ width: '100%', height: 'calc(100% - 80px)', border: 'none', borderRadius: '12px', background: '#fff' }} title="Preview" />
            </div>
          </div>
        )}

        {/* ============ PROJECT MODAL ============ */}
        {showProjectModal && (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowProjectModal(false)}>
            <div className="sheet">
              <div className="sheet-handle" />
              <h2>📝 Empty Project</h2>
              <label>Project Name</label>
              <input type="text" placeholder="my-app" value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} />
              <div className="sheet-actions">
                <button className="btn btn-outline" onClick={() => setShowProjectModal(false)}>Cancel</button>
                <button className="btn btn-success" onClick={createEmptyProject} disabled={loading}>{loading ? '⏳' : '🚀'} Create</button>
              </div>
            </div>
          </div>
        )}

        {/* ============ VARIABLES MODAL ============ */}
        {showVarsModal && varsContext && (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowVarsModal(false)}>
            <div className="sheet sheet-large">
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div><h2>🔐 Variables</h2><p className="hint">{varsContext.project.name} → {varsContext.service.name}</p></div>
                <button className="close-btn" onClick={() => setShowVarsModal(false)}>✕</button>
              </div>
              <div className="var-add">
                <input placeholder="KEY" value={newVar.name} onChange={(e) => setNewVar({ ...newVar, name: e.target.value.toUpperCase() })} />
                <input placeholder="VALUE" value={newVar.value} onChange={(e) => setNewVar({ ...newVar, value: e.target.value })} />
                <button className="btn btn-success btn-sm" onClick={upsertVariable}>➕</button>
              </div>
              {varsLoading ? <div className="vars-load">⏳ Loading...</div> :
                Object.keys(vars).length === 0 ? <div className="vars-empty">📭 Koi variable nahi</div> :
                <div className="vars-list">
                  {Object.entries(vars).map(([key, value]) => (
                    <div key={key} className="var-item">
                      <div className="var-key">{key}</div>
                      <div className="var-val">{revealed[key] ? <code>{String(value)}</code> : <code className="mask">••••••••</code>}</div>
                      <div className="var-btns">
                        <button className="icon-btn" onClick={() => toggleReveal(key)}>{revealed[key] ? '🙈' : '👁️'}</button>
                        <button className="icon-btn" onClick={() => copyText(String(value), 'Value')}>📋</button>
                        <button className="icon-btn" onClick={() => deleteVariable(key)}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              }
            </div>
          </div>
        )}

        {/* ============ DEBUG MODAL ============ */}
        {showDebugModal && debugData && (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowDebugModal(false)}>
            <div className="sheet sheet-large">
              <div className="sheet-handle" />
              <div className="sheet-head"><h2>🔍 Debug</h2><button className="close-btn" onClick={() => setShowDebugModal(false)}>✕</button></div>
              <pre style={{ background: '#0a0a0f', padding: '14px', borderRadius: '10px', fontSize: '11px', color: '#cbd5e1', overflow: 'auto', maxHeight: '400px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(debugData, null, 2)}
              </pre>
              <button className="btn btn-primary btn-full" style={{ marginTop: '14px' }} onClick={() => copyText(JSON.stringify(debugData, null, 2), 'Debug')}>📋 Copy</button>
            </div>
          </div>
        )}

        {/* ============ DEPLOY PROGRESS ============ */}
        {showDeployModal && (
          <div className="overlay">
            <div className="sheet sheet-large">
              <div className="sheet-handle" />
              <h2>🚀 Deploying...</h2>
              <div className="deploy-steps">
                {deploySteps.map((s, i) => (
                  <div key={i} className={`deploy-step deploy-${s.status}`}>
                    <span className="deploy-step-icon">
                      {s.status === 'done' ? '✅' : s.status === 'error' ? '❌' : s.status === 'warn' ? '⚠️' : '⏳'}
                    </span>
                    <div className="deploy-step-content">
                      <div className="deploy-step-text">{s.text}</div>
                      {s.detail && <div className="deploy-step-detail">{s.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
              {!deploying && (
                <div className="sheet-actions" style={{ marginTop: '20px' }}>
                  <button className="btn btn-primary btn-full" onClick={() => { setShowDeployModal(false); setDeploySteps([]); }}>Close</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ TOAST ============ */}
        {toast && <div className={`toast ${toast.isError ? 'err' : ''}`}>{toast.msg}</div>}
      </div>

      <style jsx global>{`
        .app { min-height: 100vh; padding-bottom: 90px; background: radial-gradient(circle at 0% 0%, rgba(168, 85, 247, 0.08) 0%, transparent 40%), radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.08) 0%, transparent 40%), #05050a; }
        .header { padding: 16px; position: sticky; top: 0; z-index: 40; background: rgba(5, 5, 10, 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom: 1px solid rgba(42, 42, 74, 0.4); display: flex; justify-content: space-between; align-items: center; }
        .brand { display: flex; align-items: center; gap: 12px; }
        .logo { font-size: 28px; filter: drop-shadow(0 0 12px rgba(168, 85, 247, 0.5)); }
        .header h1 { font-size: 18px; font-weight: 700; background: linear-gradient(90deg, #a855f7, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .settings-btn { background: rgba(42, 42, 74, 0.5); width: 42px; height: 42px; border-radius: 12px; font-size: 18px; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; }
        .settings-btn:active { transform: scale(0.9); background: rgba(168, 85, 247, 0.2); }
        .status-line { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 8px #22c55e; animation: pulse 2s infinite; flex-shrink: 0; }
        .dot-loading { background: #f59e0b; box-shadow: 0 0 8px #f59e0b; }
        .dot-error { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .status-text { font-size: 11px; color: #9ca3af; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
        .main { padding: 16px; }
        .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 16px; }
        .stat { background: linear-gradient(135deg, #12121f, #0f0f1a); border: 1px solid #2a2a4a; border-radius: 14px; padding: 14px; position: relative; overflow: hidden; }
        .stat::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, #a855f7, #3b82f6); opacity: 0.6; }
        .num { font-size: 26px; font-weight: 800; background: linear-gradient(135deg, #a855f7, #6366f1); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .lbl { font-size: 11px; color: #9ca3af; margin-top: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
        .btn-row { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .btn { padding: 12px 18px; border-radius: 12px; font-size: 14px; font-weight: 700; transition: all 0.15s; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; touch-action: manipulation; cursor: pointer; border: none; }
        .btn:active:not(:disabled) { transform: scale(0.96); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-full { width: 100%; }
        .btn-primary { background: linear-gradient(135deg, #a855f7, #6366f1); color: #fff; box-shadow: 0 4px 15px rgba(168, 85, 247, 0.3); flex: 1; }
        .btn-success { background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff; box-shadow: 0 4px 15px rgba(34, 197, 94, 0.25); flex: 1; }
        .btn-warning { background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.25); }
        .btn-info { background: linear-gradient(135deg, #06b6d4, #0891b2); color: #fff; box-shadow: 0 4px 15px rgba(6, 182, 212, 0.25); }
        .btn-danger { background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff; }
        .btn-outline { background: transparent; color: #a855f7; border: 1.5px solid #a855f7; }
        .btn-sm { padding: 8px 14px; font-size: 13px; min-height: 38px; }
        .info { background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); padding: 14px; border-radius: 12px; margin-bottom: 16px; font-size: 13px; color: #93c5fd; line-height: 1.6; }
        .deploy-section { background: linear-gradient(135deg, rgba(168, 85, 247, 0.05), rgba(59, 130, 246, 0.05)); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: 16px; padding: 16px; margin-bottom: 16px; }
        .deploy-title { font-size: 14px; font-weight: 700; color: #e5e7eb; margin-bottom: 12px; }
        .deploy-btns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .deploy-card { background: rgba(10, 10, 15, 0.6); border: 1px solid #2a2a4a; border-radius: 12px; padding: 12px 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; transition: all 0.2s; text-align: center; }
        .deploy-card:active { transform: scale(0.95); border-color: #a855f7; }
        .deploy-icon { font-size: 24px; }
        .deploy-name { font-size: 11px; font-weight: 700; color: #e5e7eb; }
        .deploy-desc { font-size: 9px; color: #6b7280; line-height: 1.3; }
        .search { width: 100%; padding: 14px 16px; background: #12121f; border: 1px solid #2a2a4a; border-radius: 12px; color: #fff; font-size: 15px; margin-bottom: 16px; }
        .search:focus { outline: none; border-color: #a855f7; box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.15); }
        .list { display: flex; flex-direction: column; gap: 12px; }
        .proj-card { background: linear-gradient(135deg, #12121f, #0f0f1a); border: 1px solid #2a2a4a; border-radius: 16px; padding: 16px; position: relative; overflow: hidden; transition: all 0.2s; }
        .proj-card:active { transform: scale(0.99); border-color: #a855f7; }
        .proj-card::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: linear-gradient(180deg, #a855f7, #3b82f6); }
        .proj-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
        .proj-name { font-size: 16px; font-weight: 700; color: #fff; word-break: break-all; flex: 1; padding-left: 8px; }
        .chip { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; background: rgba(148, 163, 184, 0.15); color: #94a3b8; text-transform: uppercase; letter-spacing: 0.4px; }
        .chip-green { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
        .chip-blue { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
        .chip-purple { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
        .proj-meta { font-size: 12px; color: #9ca3af; line-height: 1.7; padding-left: 8px; margin-bottom: 10px; }
        .services { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; padding-left: 8px; }
        .svc { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: rgba(10, 10, 15, 0.6); border: 1px solid #2a2a4a; border-radius: 10px; font-size: 12px; gap: 8px; }
        .svc-name { color: #cbd5e1; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .proj-actions { display: flex; gap: 8px; padding-left: 8px; }
        .proj-actions .btn { flex: 1; padding: 10px; font-size: 12px; }
        .token-item { background: linear-gradient(135deg, #12121f, #0f0f1a); border: 1px solid #2a2a4a; border-radius: 14px; padding: 16px; margin-bottom: 12px; }
        .token-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
        .token-name { font-size: 14px; font-weight: 700; color: #fff; word-break: break-all; }
        .token-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
        .token-value { font-family: 'Courier New', monospace; font-size: 11px; color: #6b7280; background: #0a0a0f; padding: 8px 12px; border-radius: 8px; margin-bottom: 10px; word-break: break-all; }
        .empty { text-align: center; padding: 60px 20px; background: #12121f; border-radius: 16px; border: 2px dashed #2a2a4a; }
        .empty-icon { font-size: 56px; margin-bottom: 16px; opacity: 0.6; }
        .empty h3 { font-size: 16px; color: #e5e7eb; margin-bottom: 6px; }
        .empty p { font-size: 13px; color: #6b7280; }
        .bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; height: 72px; background: rgba(10, 10, 15, 0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-top: 1px solid rgba(42, 42, 74, 0.6); display: flex; z-index: 50; padding-bottom: env(safe-area-inset-bottom); }
        .nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; color: #6b7280; transition: all 0.2s; font-size: 10px; font-weight: 600; position: relative; background: none; border: none; cursor: pointer; }
        .nav-item.active { color: #a855f7; }
        .nav-item.active::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 30px; height: 3px; background: linear-gradient(90deg, #a855f7, #6366f1); border-radius: 0 0 3px 3px; }
        .nav-item:active { transform: scale(0.92); }
        .nav-icon { font-size: 22px; line-height: 1; }
        .nav-label { text-transform: uppercase; letter-spacing: 0.5px; }
        .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: flex-end; justify-content: center; animation: fadeIn 0.2s; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .sheet { background: #12121f; border-radius: 24px 24px 0 0; padding: 8px 20px 30px; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); padding-bottom: calc(30px + env(safe-area-inset-bottom)); }
        .sheet-large { max-height: 85vh; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .sheet-handle { width: 40px; height: 4px; background: #2a2a4a; border-radius: 4px; margin: 8px auto 16px; }
        .sheet h2 { font-size: 20px; color: #a855f7; margin-bottom: 6px; font-weight: 700; }
        .sheet-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; gap: 10px; }
        .hint { font-size: 12px; color: #9ca3af; margin-bottom: 16px; line-height: 1.5; }
        .sheet label { display: block; font-size: 12px; color: #9ca3af; margin-bottom: 6px; margin-top: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }
        .sheet input, .sheet select, .sheet textarea { width: 100%; padding: 14px 16px; background: #0a0a0f; border: 1px solid #2a2a4a; border-radius: 12px; color: #fff; font-size: 15px; transition: all 0.2s; }
        .sheet input:focus, .sheet select:focus, .sheet textarea:focus { outline: none; border-color: #a855f7; box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.15); }
        .sheet-actions { display: flex; gap: 10px; margin-top: 24px; }
        .sheet-actions .btn { flex: 1; }
        .close-btn { background: rgba(239, 68, 68, 0.15); color: #ef4444; width: 36px; height: 36px; border-radius: 50%; font-size: 16px; display: flex; align-items: center; justify-content: center; font-weight: 700; cursor: pointer; border: none; }
        .var-add { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .var-add input { flex: 1; min-width: 100px; padding: 12px 14px; background: #0a0a0f; border: 1px solid #2a2a4a; border-radius: 10px; color: #fff; font-size: 14px; }
        .var-add input:focus { outline: none; border-color: #a855f7; }
        .var-add .btn { min-width: 44px; padding: 12px; }
        .vars-load, .vars-empty { text-align: center; padding: 40px 20px; color: #6b7280; font-size: 14px; }
        .vars-list { display: flex; flex-direction: column; gap: 8px; }
        .var-item { background: #0a0a0f; border: 1px solid #2a2a4a; border-radius: 12px; padding: 12px; }
        .var-key { font-size: 12px; font-weight: 700; color: #a855f7; margin-bottom: 6px; word-break: break-all; font-family: 'Courier New', monospace; }
        .var-val { font-size: 12px; color: #cbd5e1; margin-bottom: 10px; word-break: break-all; min-height: 20px; }
        .var-val code { font-family: 'Courier New', monospace; background: rgba(168, 85, 247, 0.08); padding: 3px 6px; border-radius: 4px; }
        .var-val .mask { color: #4b5563; letter-spacing: 2px; }
        .var-btns { display: flex; gap: 6px; justify-content: flex-end; }
        .icon-btn { width: 38px; height: 38px; border-radius: 10px; background: rgba(42, 42, 74, 0.5); font-size: 16px; display: flex; align-items: center; justify-content: center; transition: all 0.15s; cursor: pointer; border: none; color: inherit; }
        .icon-btn:active { transform: scale(0.9); background: rgba(168, 85, 247, 0.2); }
        .deploy-steps { display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto; padding: 4px 0; }
        .deploy-step { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; background: #0a0a0f; border: 1px solid #2a2a4a; border-radius: 10px; font-size: 12px; }
        .deploy-done { border-color: rgba(34, 197, 94, 0.4); background: rgba(34, 197, 94, 0.05); }
        .deploy-error { border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.05); }
        .deploy-warn { border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.05); }
        .deploy-step-icon { font-size: 14px; flex-shrink: 0; }
        .deploy-step-content { flex: 1; }
        .deploy-step-text { color: #e5e7eb; }
        .deploy-step-detail { color: #6b7280; font-size: 11px; margin-top: 3px; }
        .editor-tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
        .editor-tab { padding: 8px 12px; background: #0a0a0f; border: 1px solid #2a2a4a; border-radius: 8px; font-size: 12px; color: #9ca3af; cursor: pointer; }
        .editor-tab.active { background: rgba(168, 85, 247, 0.15); border-color: #a855f7; color: #a855f7; }
        .editor-tab.add { color: #22c55e; font-weight: 700; }
        .usage-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .usage-card { background: #0a0a0f; border: 1px solid #2a2a4a; border-radius: 12px; padding: 12px; text-align: center; }
        .usage-label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
        .usage-value { font-size: 18px; font-weight: 800; color: #a855f7; margin-top: 4px; }
        .github-user-bar { display: flex; align-items: center; gap: 12px; padding: 12px; background: linear-gradient(135deg, #12121f, #0f0f1a); border: 1px solid #2a2a4a; border-radius: 14px; margin-bottom: 16px; }
        .github-avatar { width: 44px; height: 44px; border-radius: 50%; border: 2px solid #a855f7; }
        .github-user-info { flex: 1; }
        .github-user-name { font-size: 14px; font-weight: 700; color: #fff; }
        .github-user-login { font-size: 11px; color: #9ca3af; }
        .github-repo-count { font-size: 12px; color: #a855f7; font-weight: 700; background: rgba(168, 85, 247, 0.1); padding: 6px 12px; border-radius: 20px; }
        .filter-tabs { display: flex; gap: 6px; margin-bottom: 16px; overflow-x: auto; }
        .filter-tab { padding: 8px 14px; background: #12121f; border: 1px solid #2a2a4a; border-radius: 10px; font-size: 12px; font-weight: 600; color: #9ca3af; cursor: pointer; white-space: nowrap; }
        .filter-tab.active { background: linear-gradient(135deg, #a855f7, #6366f1); color: #fff; border-color: transparent; }
        .repo-list { display: flex; flex-direction: column; gap: 10px; }
        .repo-card { background: linear-gradient(135deg, #12121f, #0f0f1a); border: 1px solid #2a2a4a; border-radius: 14px; padding: 14px; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden; }
        .repo-card:active { transform: scale(0.99); border-color: #a855f7; }
        .repo-card::before { content: ''; position: absolute; top: 0; left: 0; width: 3px; height: 100%; background: linear-gradient(180deg, #22c55e, #16a34a); }
        .repo-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
        .repo-icon { font-size: 22px; flex-shrink: 0; }
        .repo-info { flex: 1; min-width: 0; }
        .repo-name { font-size: 14px; font-weight: 700; color: #fff; word-break: break-word; }
        .repo-full { font-size: 11px; color: #6b7280; word-break: break-all; margin-top: 2px; }
        .repo-deploy-btn { padding: 8px 12px !important; font-size: 12px !important; min-height: 34px !important; flex-shrink: 0; }
        .repo-desc { font-size: 12px; color: #9ca3af; line-height: 1.5; margin-bottom: 10px; padding-left: 32px; }
        .repo-meta { display: flex; gap: 6px; flex-wrap: wrap; padding-left: 32px; }
        .repo-detail-card { background: #0a0a0f; border: 1px solid #2a2a4a; border-radius: 12px; padding: 12px; margin-bottom: 16px; }
        .repo-detail-row { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; font-size: 12px; border-bottom: 1px solid rgba(42, 42, 74, 0.5); }
        .repo-detail-row:last-child { border-bottom: none; }
        .repo-detail-label { color: #9ca3af; }
        .repo-detail-val { color: #e5e7eb; font-weight: 600; word-break: break-all; text-align: right; }
        .repo-files-preview { background: #0a0a0f; border: 1px solid #2a2a4a; border-radius: 12px; padding: 12px; margin-bottom: 16px; }
        .repo-files-title { font-size: 12px; color: #9ca3af; margin-bottom: 8px; font-weight: 600; }
        .repo-files-list { display: flex; gap: 6px; flex-wrap: wrap; }
        .repo-file-chip { padding: 4px 10px; background: rgba(42, 42, 74, 0.5); border-radius: 8px; font-size: 11px; color: #cbd5e1; }
        .toast { position: fixed; bottom: 88px; left: 16px; right: 16px; padding: 14px 18px; background: #12121f; border-left: 4px solid #22c55e; border-radius: 12px; color: #fff; z-index: 200; font-size: 13px; font-weight: 500; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6); animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); word-break: break-word; max-width: 500px; margin: 0 auto; white-space: pre-line; }
        .toast.err { border-color: #ef4444; }
        @keyframes toastIn { from { transform: translateY(100px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @media (min-width: 768px) {
          .stats-grid { grid-template-columns: repeat(4, 1fr); }
          .list { display: grid; grid-template-columns: repeat(2, 1fr); }
          .btn-row .btn { flex: 0 0 auto; }
          .btn-row .btn:first-child { flex: 1; }
          .overlay { align-items: center; }
          .sheet { border-radius: 24px; padding: 20px 30px 30px; }
          .repo-list { display: grid; grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </>
  );
}

// ==================== PROJECT LIST ====================
function ProjectList({ projects, onCopy, onDelete, onVars, onPreview }) {
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
            📅 {new Date(p.createdAt).toLocaleDateString('en-IN')} · 🔧 {p.services?.length || 0} services
          </div>
          {p.services && p.services.length > 0 && (
            <div className="services">
              {p.services.map((s) => (
                <div key={s.id} className="svc">
                  <span className="svc-name">⚙️ {s.name}</span>
                  <button className="btn btn-outline btn-sm" onClick={() => onVars(p, s)}>🔐 Vars</button>
                </div>
              ))}
            </div>
          )}
          <div className="proj-actions">
            <a href={p.url} target="_blank" rel="noreferrer" className="btn btn-primary">🔗 Open</a>
            <button className="btn btn-outline" onClick={() => onPreview(p.url)}>👁️</button>
            <button className="btn btn-outline" onClick={() => onCopy(p.url, 'Link')}>📋</button>
            <button className="btn btn-danger" onClick={() => onDelete(p.id, p.name)}>🗑️</button>
          </div>
        </div>
      ))}
    </div>
  );
}