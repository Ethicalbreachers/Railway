import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';

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

  getProjectsDirect: `
    query {
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
  `,

  getProjectDetails: `
    query($id: String!) {
      project(id: $id) {
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

  // GitHub deploy ke liye
  createService: `
    mutation($projectId: String!, $name: String!, $source: ServiceSourceInput) {
      serviceCreate(
        input: {
          projectId: $projectId
          name: $name
          source: $source
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

  // Modals
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showVarsModal, setShowVarsModal] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);

  const [debugData, setDebugData] = useState(null);

  // Token
  const [newToken, setNewToken] = useState({
    email: '',
    token: '',
    priority: 1,
    type: 'auto',
  });

  // New Project (empty)
  const [newProject, setNewProject] = useState({ name: '' });

  // GitHub Deploy
  const [githubDeploy, setGithubDeploy] = useState({
    projectName: '',
    repoUrl: '',
    branch: 'main',
    serviceName: 'web',
    envVars: [{ key: '', value: '' }],
  });

  // File Upload
  const [uploadDeploy, setUploadDeploy] = useState({
    projectName: '',
    serviceName: 'web',
    files: [],
    envVars: [{ key: '', value: '' }],
  });

  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef(null);

  // Deploy progress
  const [deploySteps, setDeploySteps] = useState([]);
  const [deploying, setDeploying] = useState(false);

  // Variables
  const [varsContext, setVarsContext] = useState(null);
  const [vars, setVars] = useState({});
  const [varsLoading, setVarsLoading] = useState(false);
  const [newVar, setNewVar] = useState({ name: '', value: '' });
  const [revealed, setRevealed] = useState({});

  // ============ LOAD ============
  useEffect(() => {
    try {
      const t = localStorage.getItem('rw_tokens_v6');
      if (t) {
        const p = JSON.parse(t);
        if (Array.isArray(p)) setTokens(p);
      }
      const pr = localStorage.getItem('rw_projects_v6');
      if (pr) {
        const p = JSON.parse(pr);
        if (Array.isArray(p)) setProjects(p);
      }
      const gh = localStorage.getItem('rw_github_settings');
      if (gh) {
        const p = JSON.parse(gh);
        if (p.githubToken) {
          setGithubDeploy((prev) => ({ ...prev, githubToken: p.githubToken }));
        }
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (tokens.length) localStorage.setItem('rw_tokens_v6', JSON.stringify(tokens));
    else localStorage.removeItem('rw_tokens_v6');
  }, [tokens]);

  useEffect(() => {
    if (projects.length) localStorage.setItem('rw_projects_v6', JSON.stringify(projects));
  }, [projects]);

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
        query,
        variables,
        tokens: [
          {
            email: token.email,
            token: token.token.trim(),
            priority: 1,
          },
        ],
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
        query,
        variables,
        tokens: tokens.map((t) => ({
          email: t.email,
          token: t.token.trim(),
          priority: t.priority,
        })),
      }),
    });

    const data = await res.json();
    if (data.debug) {
      setDebugData(data.debug);
      console.log('🔍 Debug:', data.debug);
    }
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
      // Attempt 1: me.projects
      try {
        const result = await railwayCallOne(Q.getProjectsViaMe, {}, token);
        const edges = result.data?.me?.projects?.edges || [];
        const email = result.data?.me?.email || token.email;

        const list = edges.map((e) => ({
          id: e.node.id,
          name: e.node.name,
          createdAt: e.node.createdAt,
          services: e.node.services?.edges?.map((s) => s.node) || [],
          environments: e.node.environments?.edges?.map((en) => en.node) || [],
          url: `https://${e.node.name}.up.railway.app`,
          account: email,
        }));

        setProjects(list);
        setDetectedTokenType('account');
        setStatusText(`✅ Account • ${email} • ${list.length} projects`);
        showToast(`✅ ${list.length} projects loaded (Account)`);
        setLoading(false);
        return;
      } catch (err1) {
        debugLog.push({ account: token.email, attempt: 'me.projects', error: err1.message.split('\n')[0] });
      }

      // Attempt 2: projects direct
      try {
        const result = await railwayCallOne(Q.getProjectsDirect, {}, token);
        const edges = result.data?.projects?.edges || [];

        const list = edges.map((e) => ({
          id: e.node.id,
          name: e.node.name,
          createdAt: e.node.createdAt,
          services: e.node.services?.edges?.map((s) => s.node) || [],
          environments: e.node.environments?.edges?.map((en) => en.node) || [],
          url: `https://${e.node.name}.up.railway.app`,
          account: token.email,
        }));

        setProjects(list);
        setDetectedTokenType('workspace');
        setStatusText(`✅ Workspace • ${token.email} • ${list.length} projects`);
        showToast(`✅ ${list.length} projects loaded (Workspace)`);
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
          results.push({
            email: token.email,
            type: 'account',
            status: '✅ Account Token',
            detail: `Email: ${r1.data.me.email}`,
          });
          continue;
        }
      } catch (e) {}

      try {
        const r2 = await railwayCallOne(Q.getProjectsDirect, {}, token);
        if (r2.data?.projects) {
          results.push({
            email: token.email,
            type: 'workspace',
            status: '✅ Workspace Token',
            detail: `${r2.data.projects.edges.length} projects`,
          });
          continue;
        }
      } catch (e) {}

      results.push({
        email: token.email,
        type: 'fail',
        status: '❌ Fail',
        detail: 'Token invalid',
      });
    }

    const success = results.find((r) => r.status.includes('✅'));
    if (success) {
      showToast(`✅ ${success.status}`);
      setStatusText(`✅ ${success.status}`);
    } else {
      showToast('❌ Sab tokens fail', true);
      setStatusText('❌ Token galat', 'error');
    }
    setDebugData(results);
    setShowDebugModal(true);
    setLoading(false);
  };

  // ============ GITHUB DEPLOY ============
  const deployFromGitHub = async () => {
    const { projectName, repoUrl, branch, serviceName, envVars } = githubDeploy;

    if (!projectName.trim()) return showToast('Project naam daalo!', true);
    if (!/^[a-z0-9-]+$/.test(projectName)) {
      return showToast('Sirf lowercase, numbers, hyphen!', true);
    }
    if (!repoUrl.trim()) return showToast('GitHub repo URL daalo!', true);

    // Validate GitHub URL
    if (!/^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+\/?$/.test(repoUrl.trim())) {
      return showToast('GitHub URL galat hai. Format: https://github.com/user/repo', true);
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
        if (copy.length > 0) {
          copy[copy.length - 1] = { ...copy[copy.length - 1], status, detail };
        }
        return copy;
      });
    };

    try {
      // Step 1: Create project
      addStep(`Creating project "${projectName}"...`);
      const projResult = await railwayCall(Q.createProject, { name: projectName });
      const projectId = projResult.data?.projectCreate?.id;
      if (!projectId) throw new Error('Project ID nahi mila');
      updateLastStep('done', `Project ID: ${projectId.substring(0, 8)}...`);

      // Step 2: Get default environment
      addStep('Getting environment...');
      const projDetails = await railwayCall(Q.getProjectDetails, { id: projectId });
      const environments = projDetails.data?.project?.environments?.edges || [];
      if (environments.length === 0) throw new Error('Koi environment nahi mila');
      const environmentId = environments[0].node.id;
      updateLastStep('done', `Env: ${environments[0].node.name}`);

      // Step 3: Create service from GitHub
      addStep(`Creating service from GitHub: ${repoUrl.split('/').slice(-2).join('/')}`);
      let serviceId = null;

      try {
        // Railway API for service create with GitHub source
        const serviceResult = await railwayCall(Q.createService, {
          projectId,
          name: serviceName,
          source: {
            repo: repoUrl.trim(),
            branch: branch || 'main',
          },
        });
        serviceId = serviceResult.data?.serviceCreate?.id;
        updateLastStep('done', serviceId ? `Service: ${serviceId.substring(0, 8)}...` : 'Service created');
      } catch (svcErr) {
        // Service create API may not support source directly
        // Fallback: create empty service (user manually connect karega)
        addStep('⚠️ Auto-connect fail — manual steps follow', 'warn');
        updateLastStep('warn', 'Railway dashboard pe jaake GitHub connect karna padega');
      }

      // Step 4: Set environment variables (if any)
      const validEnvVars = envVars.filter((e) => e.key.trim() && e.value.trim());
      if (validEnvVars.length > 0 && serviceId) {
        addStep(`Setting ${validEnvVars.length} environment variables...`);
        for (const env of validEnvVars) {
          try {
            await railwayCall(Q.upsertVariable, {
              projectId,
              environmentId,
              serviceId,
              name: env.key.trim().toUpperCase(),
              value: env.value,
            });
          } catch (e) {
            console.warn('Var set fail:', env.key, e.message);
          }
        }
        updateLastStep('done', `${validEnvVars.length} vars set`);
      }

      // Step 5: Done
      addStep('✅ Deploy complete!', 'done', 'Railway pe check karo');

      showToast(`🚀 "${projectName}" create ho gaya! Railway pe check karo.`);
      await loadProjects();

      // Reset
      setGithubDeploy({
        projectName: '',
        repoUrl: '',
        branch: 'main',
        serviceName: 'web',
        envVars: [{ key: '', value: '' }],
      });
    } catch (err) {
      addStep(`❌ ${err.message}`, 'error');
      showToast('❌ ' + err.message.split('\n')[0], true);
    } finally {
      setDeploying(false);
    }
  };

  // ============ FILE UPLOAD → GITHUB → DEPLOY ============
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    setUploadDeploy((prev) => ({ ...prev, files }));
  };

  const deployFromFiles = async () => {
    const { projectName, serviceName, files, envVars } = uploadDeploy;

    if (!projectName.trim()) return showToast('Project naam daalo!', true);
    if (!/^[a-z0-9-]+$/.test(projectName)) {
      return showToast('Sirf lowercase, numbers, hyphen!', true);
    }
    if (files.length === 0) return showToast('Kam se kam ek file select karo!', true);

    // GitHub token chahiye upload ke liye
    const ghToken = githubDeploy.githubToken;
    if (!ghToken) {
      return showToast('GitHub Personal Access Token chahiye (Settings me daalo)', true);
    }

    setUploadingFiles(true);
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
      // Step 1: Create GitHub repo
      addStep(`Creating GitHub repo: ${projectName}`);
      const repoRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `token ${ghToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          name: projectName,
          private: false,
          auto_init: true,
          description: 'Created via Railway Panel',
        }),
      });

      if (!repoRes.ok) {
        const errData = await repoRes.json();
        throw new Error('GitHub repo create fail: ' + (errData.message || repoRes.status));
      }

      const repo = await repoRes.json();
      const repoFullName = repo.full_name;
      const owner = repo.owner.login;
      const defaultBranch = repo.default_branch || 'main';
      updateLastStep('done', `github.com/${repoFullName}`);

      // Step 2: Upload each file
      addStep(`Uploading ${files.length} files...`);
      for (const file of files) {
        const reader = new FileReader();
        const content = await new Promise((resolve, reject) => {
          reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // GitHub path
        const path = file.webkitRelativePath || file.name;

        // Check if file exists (for update)
        const checkRes = await fetch(
          `https://api.github.com/repos/${repoFullName}/contents/${encodeURIComponent(path)}`,
          {
            headers: {
              Authorization: `token ${ghToken}`,
              Accept: 'application/vnd.github.v3+json',
            },
          }
        );

        let sha = null;
        if (checkRes.ok) {
          const existing = await checkRes.json();
          sha = existing.sha;
        }

        // Upload
        const uploadRes = await fetch(
          `https://api.github.com/repos/${repoFullName}/contents/${encodeURIComponent(path)}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `token ${ghToken}`,
              Accept: 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `Add ${path}`,
              content,
              branch: defaultBranch,
              ...(sha ? { sha } : {}),
            }),
          }
        );

        if (!uploadRes.ok) {
          console.warn('Upload fail:', path);
        }
      }
      updateLastStep('done', `${files.length} files uploaded`);

      // Step 3: Create Railway project
      addStep(`Creating Railway project...`);
      const projResult = await railwayCall(Q.createProject, { name: projectName });
      const projectId = projResult.data?.projectCreate?.id;
      if (!projectId) throw new Error('Project ID nahi mila');
      updateLastStep('done', `Project created`);

      // Step 4: Get environment
      addStep('Getting environment...');
      const projDetails = await railwayCall(Q.getProjectDetails, { id: projectId });
      const environments = projDetails.data?.project?.environments?.edges || [];
      if (environments.length === 0) throw new Error('Environment nahi mila');
      const environmentId = environments[0].node.id;
      updateLastStep('done');

      // Step 5: Link GitHub repo
      addStep('Linking GitHub repo to Railway...');
      try {
        await railwayCall(Q.createService, {
          projectId,
          name: serviceName || 'web',
          source: {
            repo: `https://github.com/${repoFullName}`,
            branch: defaultBranch,
          },
        });
        updateLastStep('done', 'Linked!');
      } catch (e) {
        updateLastStep('warn', 'Manual link needed in Railway dashboard');
      }

      addStep('✅ Deploy started!', 'done', 'Railway build karega');

      showToast(`🚀 "${projectName}" GitHub pe upload + Railway pe deploy!`);
      await loadProjects();

      setUploadDeploy({
        projectName: '',
        serviceName: 'web',
        files: [],
        envVars: [{ key: '', value: '' }],
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      addStep(`❌ ${err.message}`, 'error');
      showToast('❌ ' + err.message.split('\n')[0], true);
    } finally {
      setUploadingFiles(false);
      setDeploying(false);
    }
  };

  // ============ TOKENS ============
  const addToken = () => {
    const { email, token, priority, type } = newToken;
    const trimmedToken = token.trim();

    if (!email.trim() || !trimmedToken) return showToast('Naam aur token chahiye!', true);
    if (trimmedToken.length < 20) return showToast('Token chhota hai!', true);
    if (/\s/.test(trimmedToken)) return showToast('Token me space hai!', true);

    const newT = {
      id: 'tok_' + Date.now(),
      email: email.trim(),
      name: email.trim(),
      token: trimmedToken,
      priority: parseInt(priority) || tokens.length + 1,
      type: type || 'auto',
      addedAt: new Date().toISOString(),
    };

    setTokens([...tokens, newT].sort((a, b) => a.priority - b.priority));
    setNewToken({ email: '', token: '', priority: tokens.length + 2, type: 'auto' });
    setShowTokenModal(false);
    showToast('✅ Token add!');
  };

  const deleteToken = (id) => {
    if (!confirm('Delete token?')) return;
    setTokens(tokens.filter((t) => t.id !== id));
    showToast('🗑️ Deleted');
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
    } catch (err) {
      showToast('❌ ' + err.message.split('\n')[0], true);
    } finally {
      setLoading(false);
    }
  };

  const deleteProject = async (id, name) => {
    if (!confirm(`"${name}" delete?`)) return;
    setLoading(true);
    try {
      await railwayCall(Q.deleteProject, { id });
      showToast('🗑️ Deleted');
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
      return showToast('Environment nahi mila', true);
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
    if (!newVar.name.trim()) return showToast('Naam daalo!', true);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newVar.name)) {
      return showToast('Naam letter ya _ se shuru!', true);
    }
    try {
      await railwayCall(Q.upsertVariable, {
        projectId: varsContext.project.id,
        environmentId: varsContext.environment.id,
        serviceId: varsContext.service.id,
        name: newVar.name,
        value: newVar.value,
      });
      showToast('✅ Save!');
      setNewVar({ name: '', value: '' });
      await loadVars(varsContext.project.id, varsContext.environment.id, varsContext.service.id);
    } catch (err) {
      showToast('❌ ' + err.message.split('\n')[0], true);
    }
  };

  const deleteVariable = async (name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await railwayCall(Q.deleteVariable, {
        projectId: varsContext.project.id,
        environmentId: varsContext.environment.id,
        serviceId: varsContext.service.id,
        name,
      });
      showToast('🗑️');
      await loadVars(varsContext.project.id, varsContext.environment.id, varsContext.service.id);
    } catch (err) {
      showToast('❌ ' + err.message.split('\n')[0], true);
    }
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
          <button
            className="settings-btn"
            onClick={() => setShowGitHubModal(true)}
            title="GitHub Settings"
          >
            ⚙️
          </button>
        </header>

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

              {detectedTokenType && (
                <div
                  className="info"
                  style={{
                    background:
                      detectedTokenType === 'account'
                        ? 'rgba(34,197,94,0.08)'
                        : 'rgba(168,85,247,0.08)',
                    borderColor:
                      detectedTokenType === 'account'
                        ? 'rgba(34,197,94,0.25)'
                        : 'rgba(168,85,247,0.25)',
                    color: detectedTokenType === 'account' ? '#86efac' : '#d8b4fe',
                  }}
                >
                  {detectedTokenType === 'account'
                    ? '👤 Account Token detected'
                    : '👥 Workspace Token detected'}
                </div>
              )}

              <div className="btn-row">
                <button className="btn btn-primary" onClick={loadProjects} disabled={loading}>
                  {loading ? '⏳' : '🔄'} Refresh
                </button>
                <button className="btn btn-warning" onClick={testTokens} disabled={loading || tokens.length === 0}>
                  🧪 Test
                </button>
                <button className="btn btn-success" onClick={() => setShowTokenModal(true)}>
                  ➕ Token
                </button>
              </div>

              {/* NEW DEPLOY BUTTONS */}
              <div className="deploy-section">
                <div className="deploy-title">🚀 Deploy Karo</div>
                <div className="deploy-btns">
                  <button
                    className="deploy-card"
                    onClick={() => setShowGitHubModal(true)}
                  >
                    <span className="deploy-icon">📦</span>
                    <span className="deploy-name">GitHub Repo</span>
                    <span className="deploy-desc">URL daalo, auto deploy</span>
                  </button>
                  <button
                    className="deploy-card"
                    onClick={() => setShowUploadModal(true)}
                  >
                    <span className="deploy-icon">📁</span>
                    <span className="deploy-name">File Upload</span>
                    <span className="deploy-desc">Files upload karo</span>
                  </button>
                  <button
                    className="deploy-card"
                    onClick={() => setShowProjectModal(true)}
                  >
                    <span className="deploy-icon">📝</span>
                    <span className="deploy-name">Empty Project</span>
                    <span className="deploy-desc">Sirf naam do</span>
                  </button>
                </div>
              </div>

              {tokens.length === 0 && (
                <div className="info">
                  💡 Pehle <b>➕ Token</b> dabao. Phir deploy karo.
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
                  <p>Upar se deploy karo</p>
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
                🔑 Railway → Account Settings → Tokens → Create Token
                <br />
                <b>No workspace</b> = Account Token · <b>My Projects</b> = Workspace Token
              </div>

              {tokens.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">🔑</div>
                  <h3>Koi token nahi</h3>
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
                        <span className="chip chip-purple">{t.token.length} chars</span>
                      </div>
                      <div className="token-value">
                        {t.token.substring(0, 16)}...{t.token.slice(-8)}
                      </div>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteToken(t.id)}>
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
                <button className="btn btn-primary" onClick={loadProjects} disabled={loading}>
                  🔄 Refresh
                </button>
                <button className="btn btn-success" onClick={() => setShowProjectModal(true)}>
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
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowTokenModal(false)}>
            <div className="sheet">
              <div className="sheet-handle" />
              <h2>🔑 Naya Token</h2>
              <p className="hint">Railway → Account Settings → Tokens</p>

              <label>Naam / Email</label>
              <input
                type="text"
                placeholder="e.g., my-account"
                value={newToken.email}
                onChange={(e) => setNewToken({ ...newToken, email: e.target.value })}
              />

              <label>Token Type</label>
              <select
                value={newToken.type}
                onChange={(e) => setNewToken({ ...newToken, type: e.target.value })}
              >
                <option value="auto">🔄 Auto-detect</option>
                <option value="account">👤 Account Token</option>
                <option value="workspace">👥 My Projects</option>
              </select>

              <label>Railway Token (UUID)</label>
              <input
                type="text"
                placeholder="47d0d096-..."
                value={newToken.token}
                onChange={(e) => setNewToken({ ...newToken, token: e.target.value })}
              />

              <label>Priority</label>
              <input
                type="number"
                min="1"
                value={newToken.priority}
                onChange={(e) => setNewToken({ ...newToken, priority: e.target.value })}
              />

              <div className="sheet-actions">
                <button className="btn btn-outline" onClick={() => setShowTokenModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-success" onClick={addToken}>
                  ✅ Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ GITHUB SETTINGS MODAL ============ */}
        {showGitHubModal && (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowGitHubModal(false)}>
            <div className="sheet">
              <div className="sheet-handle" />
              <h2>⚙️ GitHub Settings</h2>
              <p className="hint">
                File Upload feature ke liye GitHub Personal Access Token chahiye.
                <br />
                Banao: GitHub → Settings → Developer → Tokens (classic) → <b>repo</b> scope
              </p>

              <label>GitHub Token (optional)</label>
              <input
                type="password"
                placeholder="ghp_xxxxx..."
                value={githubDeploy.githubToken || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setGithubDeploy({ ...githubDeploy, githubToken: v });
                  localStorage.setItem('rw_github_settings', JSON.stringify({ githubToken: v }));
                }}
              />

              <div className="sheet-actions">
                <button className="btn btn-outline" onClick={() => setShowGitHubModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ GITHUB DEPLOY MODAL ============ */}
        {showGitHubModal && false /* placeholder */}

        {/* ============ PROJECT MODAL ============ */}
        {showProjectModal && (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowProjectModal(false)}>
            <div className="sheet">
              <div className="sheet-handle" />
              <h2>📝 Empty Project</h2>
              <p className="hint">Lowercase, numbers, hyphen only</p>

              <label>Project Name</label>
              <input
                type="text"
                placeholder="my-awesome-app"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              />

              <div className="sheet-actions">
                <button className="btn btn-outline" onClick={() => setShowProjectModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-success" onClick={createEmptyProject} disabled={loading}>
                  {loading ? '⏳' : '🚀'} Create
                </button>
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
                <div>
                  <h2>🔐 Variables</h2>
                  <p className="hint">
                    {varsContext.project.name} → {varsContext.service.name}
                  </p>
                </div>
                <button className="close-btn" onClick={() => setShowVarsModal(false)}>✕</button>
              </div>

              <div className="var-add">
                <input
                  placeholder="KEY"
                  value={newVar.name}
                  onChange={(e) => setNewVar({ ...newVar, name: e.target.value.toUpperCase() })}
                />
                <input
                  placeholder="VALUE"
                  value={newVar.value}
                  onChange={(e) => setNewVar({ ...newVar, value: e.target.value })}
                />
                <button className="btn btn-success btn-sm" onClick={upsertVariable}>➕</button>
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
                        {revealed[key] ? <code>{String(value)}</code> : <code className="mask">••••••••</code>}
                      </div>
                      <div className="var-btns">
                        <button className="icon-btn" onClick={() => toggleReveal(key)}>
                          {revealed[key] ? '🙈' : '👁️'}
                        </button>
                        <button className="icon-btn" onClick={() => copyText(String(value), 'Value')}>📋</button>
                        <button className="icon-btn" onClick={() => deleteVariable(key)}>🗑️</button>
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
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowDebugModal(false)}>
            <div className="sheet sheet-large">
              <div className="sheet-handle" />
              <div className="sheet-head">
                <h2>🔍 Debug Info</h2>
                <button className="close-btn" onClick={() => setShowDebugModal(false)}>✕</button>
              </div>
              <pre style={{ background: '#0a0a0f', padding: '14px', borderRadius: '10px', fontSize: '11px', color: '#cbd5e1', overflow: 'auto', maxHeight: '400px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(debugData, null, 2)}
              </pre>
              <button className="btn btn-primary btn-full" style={{ marginTop: '14px' }} onClick={() => copyText(JSON.stringify(debugData, null, 2), 'Debug')}>
                📋 Copy
              </button>
            </div>
          </div>
        )}

        {/* ============ GITHUB DEPLOY MODAL (REAL) ============ */}
        {showGitHubModal && githubDeploy.projectName !== undefined && (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowGitHubModal(false)}>
            <div className="sheet sheet-large">
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div>
                  <h2>📦 Deploy from GitHub</h2>
                  <p className="hint">Repo URL daalo — Railway auto deploy karega</p>
                </div>
                <button className="close-btn" onClick={() => setShowGitHubModal(false)}>✕</button>
              </div>

              <label>Project Name *</label>
              <input
                type="text"
                placeholder="my-app"
                value={githubDeploy.projectName}
                onChange={(e) => setGithubDeploy({ ...githubDeploy, projectName: e.target.value })}
              />

              <label>GitHub Repo URL *</label>
              <input
                type="text"
                placeholder="https://github.com/user/repo"
                value={githubDeploy.repoUrl}
                onChange={(e) => setGithubDeploy({ ...githubDeploy, repoUrl: e.target.value })}
              />

              <label>Branch</label>
              <input
                type="text"
                placeholder="main"
                value={githubDeploy.branch}
                onChange={(e) => setGithubDeploy({ ...githubDeploy, branch: e.target.value })}
              />

              <label>Service Name</label>
              <input
                type="text"
                placeholder="web"
                value={githubDeploy.serviceName}
                onChange={(e) => setGithubDeploy({ ...githubDeploy, serviceName: e.target.value })}
              />

              <label>Environment Variables (optional)</label>
              {githubDeploy.envVars.map((env, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    placeholder="KEY"
                    value={env.key}
                    onChange={(e) => {
                      const copy = [...githubDeploy.envVars];
                      copy[i] = { ...copy[i], key: e.target.value.toUpperCase() };
                      setGithubDeploy({ ...githubDeploy, envVars: copy });
                    }}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="text"
                    placeholder="value"
                    value={env.value}
                    onChange={(e) => {
                      const copy = [...githubDeploy.envVars];
                      copy[i] = { ...copy[i], value: e.target.value };
                      setGithubDeploy({ ...githubDeploy, envVars: copy });
                    }}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="icon-btn"
                    onClick={() => {
                      const copy = githubDeploy.envVars.filter((_, idx) => idx !== i);
                      setGithubDeploy({ ...githubDeploy, envVars: copy.length ? copy : [{ key: '', value: '' }] });
                    }}
                    style={{ width: '44px', flexShrink: 0 }}
                  >🗑️</button>
                </div>
              ))}
              <button
                className="btn btn-outline btn-sm"
                style={{ marginTop: '4px' }}
                onClick={() =>
                  setGithubDeploy({
                    ...githubDeploy,
                    envVars: [...githubDeploy.envVars, { key: '', value: '' }],
                  })
                }
              >
                ➕ Add Env Var
              </button>

              <div className="sheet-actions" style={{ marginTop: '24px' }}>
                <button className="btn btn-outline" onClick={() => setShowGitHubModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-success" onClick={deployFromGitHub} disabled={deploying}>
                  {deploying ? '⏳' : '🚀'} Deploy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ FILE UPLOAD MODAL ============ */}
        {showUploadModal && (
          <div className="overlay" onClick={(e) => e.target === e.currentTarget && setShowUploadModal(false)}>
            <div className="sheet sheet-large">
              <div className="sheet-handle" />
              <div className="sheet-head">
                <div>
                  <h2>📁 File Upload → Deploy</h2>
                  <p className="hint">
                    Files GitHub pe upload honge, phir Railway pe deploy
                  </p>
                </div>
                <button className="close-btn" onClick={() => setShowUploadModal(false)}>✕</button>
              </div>

              {!githubDeploy.githubToken && (
                <div className="info" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                  ⚠️ Pehle GitHub Token add karo (⚙️ icon upar)
                </div>
              )}

              <label>Project Name *</label>
              <input
                type="text"
                placeholder="my-app"
                value={uploadDeploy.projectName}
                onChange={(e) => setUploadDeploy({ ...uploadDeploy, projectName: e.target.value })}
              />

              <label>Service Name</label>
              <input
                type="text"
                placeholder="web"
                value={uploadDeploy.serviceName}
                onChange={(e) => setUploadDeploy({ ...uploadDeploy, serviceName: e.target.value })}
              />

              <label>Files * (multiple select kar sakte ho)</label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                style={{
                  padding: '10px',
                  background: '#0a0a0f',
                  borderRadius: '10px',
                  border: '1px dashed #a855f7',
                  cursor: 'pointer',
                }}
              />
              {uploadDeploy.files.length > 0 && (
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
                  {uploadDeploy.files.length} files selected
                </div>
              )}

              <label>Environment Variables (optional)</label>
              {uploadDeploy.envVars.map((env, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    placeholder="KEY"
                    value={env.key}
                    onChange={(e) => {
                      const copy = [...uploadDeploy.envVars];
                      copy[i] = { ...copy[i], key: e.target.value.toUpperCase() };
                      setUploadDeploy({ ...uploadDeploy, envVars: copy });
                    }}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="text"
                    placeholder="value"
                    value={env.value}
                    onChange={(e) => {
                      const copy = [...uploadDeploy.envVars];
                      copy[i] = { ...copy[i], value: e.target.value };
                      setUploadDeploy({ ...uploadDeploy, envVars: copy });
                    }}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="icon-btn"
                    onClick={() => {
                      const copy = uploadDeploy.envVars.filter((_, idx) => idx !== i);
                      setUploadDeploy({ ...uploadDeploy, envVars: copy.length ? copy : [{ key: '', value: '' }] });
                    }}
                    style={{ width: '44px', flexShrink: 0 }}
                  >🗑️</button>
                </div>
              ))}
              <button
                className="btn btn-outline btn-sm"
                style={{ marginTop: '4px' }}
                onClick={() =>
                  setUploadDeploy({
                    ...uploadDeploy,
                    envVars: [...uploadDeploy.envVars, { key: '', value: '' }],
                  })
                }
              >
                ➕ Add Env Var
              </button>

              <div className="sheet-actions" style={{ marginTop: '24px' }}>
                <button className="btn btn-outline" onClick={() => setShowUploadModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-success"
                  onClick={deployFromFiles}
                  disabled={uploadingFiles || !githubDeploy.githubToken}
                >
                  {uploadingFiles ? '⏳' : '🚀'} Upload & Deploy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ DEPLOY PROGRESS MODAL ============ */}
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
                  <button className="btn btn-primary btn-full" onClick={() => { setShowDeployModal(false); setDeploySteps([]); }}>
                    Close
                  </button>
                </div>
              )}
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
          background: radial-gradient(circle at 0% 0%, rgba(168, 85, 247, 0.08) 0%, transparent 40%),
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
          display: flex;
          justify-content: space-between;
          align-items: center;
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

        .settings-btn {
          background: rgba(42, 42, 74, 0.5);
          width: 42px;
          height: 42px;
          border-radius: 12px;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          cursor: pointer;
          transition: all 0.15s;
        }
        .settings-btn:active { transform: scale(0.9); background: rgba(168, 85, 247, 0.2); }

        .status-line { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
        .dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #22c55e; box-shadow: 0 0 8px #22c55e;
          animation: pulse 2s infinite; flex-shrink: 0;
        }
        .dot-loading { background: #f59e0b; box-shadow: 0 0 8px #f59e0b; }
        .dot-error { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .status-text {
          font-size: 11px; color: #9ca3af;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          max-width: 240px;
        }

        .main { padding: 16px; }

        .stats-grid {
          display: grid; grid-template-columns: repeat(2, 1fr);
          gap: 10px; margin-bottom: 16px;
        }
        .stat {
          background: linear-gradient(135deg, #12121f, #0f0f1a);
          border: 1px solid #2a2a4a;
          border-radius: 14px; padding: 14px;
          position: relative; overflow: hidden;
        }
        .stat::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, #a855f7, #3b82f6); opacity: 0.6;
        }
        .num {
          font-size: 26px; font-weight: 800;
          background: linear-gradient(135deg, #a855f7, #6366f1);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .lbl {
          font-size: 11px; color: #9ca3af; margin-top: 4px;
          font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;
        }

        .btn-row { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }

        .btn {
          padding: 12px 18px; border-radius: 12px;
          font-size: 14px; font-weight: 700;
          transition: all 0.15s;
          display: inline-flex; align-items: center; justify-content: center;
          gap: 6px; min-height: 44px; touch-action: manipulation;
          cursor: pointer; border: none;
        }
        .btn:active:not(:disabled) { transform: scale(0.96); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-full { width: 100%; }

        .btn-primary {
          background: linear-gradient(135deg, #a855f7, #6366f1); color: #fff;
          box-shadow: 0 4px 15px rgba(168, 85, 247, 0.3); flex: 1;
        }
        .btn-success {
          background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff;
          box-shadow: 0 4px 15px rgba(34, 197, 94, 0.25); flex: 1;
        }
        .btn-warning {
          background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff;
          box-shadow: 0 4px 15px rgba(245, 158, 11, 0.25);
        }
        .btn-danger {
          background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff;
        }
        .btn-outline {
          background: transparent; color: #a855f7; border: 1.5px solid #a855f7;
        }
        .btn-sm { padding: 8px 14px; font-size: 13px; min-height: 38px; }

        .info {
          background: rgba(59, 130, 246, 0.08);
          border: 1px solid rgba(59, 130, 246, 0.25);
          padding: 14px; border-radius: 12px;
          margin-bottom: 16px; font-size: 13px;
          color: #93c5fd; line-height: 1.6;
        }

        .deploy-section {
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.05), rgba(59, 130, 246, 0.05));
          border: 1px solid rgba(168, 85, 247, 0.2);
          border-radius: 16px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .deploy-title {
          font-size: 14px; font-weight: 700; color: #e5e7eb;
          margin-bottom: 12px;
        }
        .deploy-btns {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
        }
        .deploy-card {
          background: rgba(10, 10, 15, 0.6);
          border: 1px solid #2a2a4a;
          border-radius: 12px;
          padding: 12px 8px;
          display: flex; flex-direction: column; align-items: center;
          gap: 4px; cursor: pointer; transition: all 0.2s;
          text-align: center;
        }
        .deploy-card:active { transform: scale(0.95); border-color: #a855f7; }
        .deploy-icon { font-size: 24px; }
        .deploy-name { font-size: 11px; font-weight: 700; color: #e5e7eb; }
        .deploy-desc { font-size: 9px; color: #6b7280; line-height: 1.3; }

        .search {
          width: 100%; padding: 14px 16px;
          background: #12121f; border: 1px solid #2a2a4a;
          border-radius: 12px; color: #fff;
          font-size: 15px; margin-bottom: 16px;
        }
        .search:focus { outline: none; border-color: #a855f7; box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.15); }

        .list { display: flex; flex-direction: column; gap: 12px; }

        .proj-card {
          background: linear-gradient(135deg, #12121f, #0f0f1a);
          border: 1px solid #2a2a4a;
          border-radius: 16px; padding: 16px;
          position: relative; overflow: hidden; transition: all 0.2s;
        }
        .proj-card:active { transform: scale(0.99); border-color: #a855f7; }
        .proj-card::before {
          content: ''; position: absolute; top: 0; left: 0;
          width: 4px; height: 100%;
          background: linear-gradient(180deg, #a855f7, #3b82f6);
        }
        .proj-head {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 10px; margin-bottom: 8px;
        }
        .proj-name {
          font-size: 16px; font-weight: 700; color: #fff;
          word-break: break-all; flex: 1; padding-left: 8px;
        }

        .chip {
          display: inline-flex; align-items: center;
          padding: 3px 10px; border-radius: 20px;
          font-size: 10px; font-weight: 700;
          background: rgba(148, 163, 184, 0.15);
          color: #94a3b8; text-transform: uppercase; letter-spacing: 0.4px;
        }
        .chip-green { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
        .chip-blue { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
        .chip-purple { background: rgba(168, 85, 247, 0.15); color: #a855f7; }

        .proj-meta {
          font-size: 12px; color: #9ca3af; line-height: 1.7;
          padding-left: 8px; margin-bottom: 10px;
        }
        .services { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; padding-left: 8px; }
        .svc {
          display: flex; justify-content: space-between; align-items: center;
          padding: 8px 10px; background: rgba(10, 10, 15, 0.6);
          border: 1px solid #2a2a4a; border-radius: 10px; font-size: 12px; gap: 8px;
        }
        .svc-name {
          color: #cbd5e1; font-weight: 500;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .proj-actions { display: flex; gap: 8px; padding-left: 8px; }
        .proj-actions .btn { flex: 1; padding: 10px; font-size: 12px; }

        .token-item {
          background: linear-gradient(135deg, #12121f, #0f0f1a);
          border: 1px solid #2a2a4a;
          border-radius: 14px; padding: 16px; margin-bottom: 12px;
        }
        .token-head {
          display: flex; justify-content: space-between; align-items: center;
          gap: 8px; margin-bottom: 10px; flex-wrap: wrap;
        }
        .token-name { font-size: 14px; font-weight: 700; color: #fff; word-break: break-all; }
        .token-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
        .token-value {
          font-family: 'Courier New', monospace; font-size: 11px;
          color: #6b7280; background: #0a0a0f;
          padding: 8px 12px; border-radius: 8px;
          margin-bottom: 10px; word-break: break-all;
        }

        .empty {
          text-align: center; padding: 60px 20px;
          background: #12121f; border-radius: 16px;
          border: 2px dashed #2a2a4a;
        }
        .empty-icon { font-size: 56px; margin-bottom: 16px; opacity: 0.6; }
        .empty h3 { font-size: 16px; color: #e5e7eb; margin-bottom: 6px; }
        .empty p { font-size: 13px; color: #6b7280; }

        .bottom-nav {
          position: fixed; bottom: 0; left: 0; right: 0; height: 72px;
          background: rgba(10, 10, 15, 0.95);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border-top: 1px solid rgba(42, 42, 74, 0.6);
          display: flex; z-index: 50;
          padding-bottom: env(safe-area-inset-bottom);
        }
        .nav-item {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 3px; color: #6b7280; transition: all 0.2s;
          font-size: 10px; font-weight: 600;
          position: relative; background: none; border: none; cursor: pointer;
        }
        .nav-item.active { color: #a855f7; }
        .nav-item.active::before {
          content: ''; position: absolute; top: 0; left: 50%;
          transform: translateX(-50%);
          width: 30px; height: 3px;
          background: linear-gradient(90deg, #a855f7, #6366f1);
          border-radius: 0 0 3px 3px;
        }
        .nav-item:active { transform: scale(0.92); }
        .nav-icon { font-size: 22px; line-height: 1; }
        .nav-label { text-transform: uppercase; letter-spacing: 0.5px; }

        .overlay {
          position: fixed; inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
          z-index: 100; display: flex;
          align-items: flex-end; justify-content: center;
          animation: fadeIn 0.2s;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .sheet {
          background: #12121f;
          border-radius: 24px 24px 0 0;
          padding: 8px 20px 30px;
          width: 100%; max-width: 600px;
          max-height: 90vh; overflow-y: auto;
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          padding-bottom: calc(30px + env(safe-area-inset-bottom));
        }
        .sheet-large { max-height: 85vh; }

        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        .sheet-handle {
          width: 40px; height: 4px; background: #2a2a4a;
          border-radius: 4px; margin: 8px auto 16px;
        }
        .sheet h2 { font-size: 20px; color: #a855f7; margin-bottom: 6px; font-weight: 700; }
        .sheet-head {
          display: flex; justify-content: space-between; align-items: flex-start;
          margin-bottom: 16px; gap: 10px;
        }
        .hint { font-size: 12px; color: #9ca3af; margin-bottom: 16px; line-height: 1.5; }
        .sheet label {
          display: block; font-size: 12px; color: #9ca3af;
          margin-bottom: 6px; margin-top: 14px;
          font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px;
        }
        .sheet input, .sheet select {
          width: 100%; padding: 14px 16px;
          background: #0a0a0f; border: 1px solid #2a2a4a;
          border-radius: 12px; color: #fff; font-size: 15px;
          transition: all 0.2s;
        }
        .sheet input:focus, .sheet select:focus {
          outline: none; border-color: #a855f7;
          box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.15);
        }

        .sheet-actions { display: flex; gap: 10px; margin-top: 24px; }
        .sheet-actions .btn { flex: 1; }

        .close-btn {
          background: rgba(239, 68, 68, 0.15); color: #ef4444;
          width: 36px; height: 36px; border-radius: 50%;
          font-size: 16px; display: flex;
          align-items: center; justify-content: center;
          font-weight: 700; cursor: pointer; border: none;
        }

        .var-add { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .var-add input {
          flex: 1; min-width: 100px;
          padding: 12px 14px;
          background: #0a0a0f; border: 1px solid #2a2a4a;
          border-radius: 10px; color: #fff; font-size: 14px;
        }
        .var-add input:focus { outline: none; border-color: #a855f7; }
        .var-add .btn { min-width: 44px; padding: 12px; }

        .vars-load, .vars-empty {
          text-align: center; padding: 40px 20px;
          color: #6b7280; font-size: 14px;
        }
        .vars-list { display: flex; flex-direction: column; gap: 8px; }
        .var-item {
          background: #0a0a0f; border: 1px solid #2a2a4a;
          border-radius: 12px; padding: 12px;
        }
        .var-key {
          font-size: 12px; font-weight: 700; color: #a855f7;
          margin-bottom: 6px; word-break: break-all;
          font-family: 'Courier New', monospace;
        }
        .var-val {
          font-size: 12px; color: #cbd5e1;
          margin-bottom: 10px; word-break: break-all; min-height: 20px;
        }
        .var-val code {
          font-family: 'Courier New', monospace;
          background: rgba(168, 85, 247, 0.08);
          padding: 3px 6px; border-radius: 4px;
        }
        .var-val .mask { color: #4b5563; letter-spacing: 2px; }
        .var-btns { display: flex; gap: 6px; justify-content: flex-end; }

        .icon-btn {
          width: 38px; height: 38px; border-radius: 10px;
          background: rgba(42, 42, 74, 0.5);
          font-size: 16px; display: flex;
          align-items: center; justify-content: center;
          transition: all 0.15s; cursor: pointer;
          border: none; color: inherit;
        }
        .icon-btn:active { transform: scale(0.9); background: rgba(168, 85, 247, 0.2); }

        .deploy-steps {
          display: flex; flex-direction: column; gap: 10px;
          max-height: 400px; overflow-y: auto;
          padding: 4px 0;
        }
        .deploy-step {
          display: flex; gap: 10px; align-items: flex-start;
          padding: 10px 12px;
          background: #0a0a0f; border: 1px solid #2a2a4a;
          border-radius: 10px; font-size: 12px;
        }
        .deploy-done { border-color: rgba(34, 197, 94, 0.4); background: rgba(34, 197, 94, 0.05); }
        .deploy-error { border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.05); }
        .deploy-warn { border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.05); }
        .deploy-step-icon { font-size: 14px; flex-shrink: 0; }
        .deploy-step-content { flex: 1; }
        .deploy-step-text { color: #e5e7eb; }
        .deploy-step-detail { color: #6b7280; font-size: 11px; margin-top: 3px; }

        .toast {
          position: fixed; bottom: 88px; left: 16px; right: 16px;
          padding: 14px 18px; background: #12121f;
          border-left: 4px solid #22c55e;
          border-radius: 12px; color: #fff;
          z-index: 200; font-size: 13px; font-weight: 500;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
          animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          word-break: break-word; max-width: 500px; margin: 0 auto;
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
            📅 {new Date(p.createdAt).toLocaleDateString('en-IN')} · 🔧 {p.services?.length || 0} services
          </div>

          {p.services && p.services.length > 0 && (
            <div className="services">
              {p.services.map((s) => (
                <div key={s.id} className="svc">
                  <span className="svc-name">⚙️ {s.name}</span>
                  <button className="btn btn-outline btn-sm" onClick={() => onVars(p, s)}>
                    🔐 Vars
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="proj-actions">
            <a href={p.url} target="_blank" rel="noreferrer" className="btn btn-primary">
              🔗 Open
            </a>
            <button className="btn btn-outline" onClick={() => onCopy(p.url, 'Link')}>📋</button>
            <button className="btn btn-danger" onClick={() => onDelete(p.id, p.name)}>🗑️</button>
          </div>
        </div>
      ))}
    </div>
  );
}