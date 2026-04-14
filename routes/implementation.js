const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

function staffOnly(req, res, next) {
  if (!['admin', 'super_admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Implementation features require admin or super admin.' });
  }
  if (!req.user?.profileId) {
    return res.status(401).json({ error: 'Profile not found for session.' });
  }
  next();
}

router.get('/companies', staffOnly, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can list all companies here.' });
    }
    const { data, error } = await supabase.admin.from('companies').select('id, name').order('name');
    if (error) return res.status(500).json({ error: error.message || 'Failed to list companies.' });
    res.json(data || []);
  } catch (e) {
    console.error('[implementation/companies]', e);
    res.status(500).json({ error: 'Failed to list companies.' });
  }
});

function assertVendorScope(req, vendor) {
  if (!vendor) return { ok: false, status: 404, error: 'Vendor not found.' };
  if (req.user.role === 'super_admin') return { ok: true };
  if (req.user.role === 'admin') {
    if (!req.user.companyId) return { ok: false, status: 403, error: 'Admin has no company scope.' };
    if (vendor.company_id !== req.user.companyId) {
      return { ok: false, status: 403, error: 'Vendor is outside your company.' };
    }
    return { ok: true };
  }
  return { ok: false, status: 403, error: 'Forbidden.' };
}

async function fetchVendorById(id) {
  const { data, error } = await supabase.admin.from('vendors').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// ── Vendors (shared board: super_admin all; admin company-scoped; null company_id = super_admin only) ──

router.get('/vendors', staffOnly, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      if (!req.user.companyId) return res.json([]);
      const { data, error } = await supabase.admin
        .from('vendors')
        .select('*')
        .eq('company_id', req.user.companyId)
        .order('sort_order', { ascending: true });
      if (error) return res.status(500).json({ error: error.message || 'Failed to list vendors.' });
      return res.json(data || []);
    }
    const cid = req.query.company_id;
    if (cid) {
      const { data, error } = await supabase.admin
        .from('vendors')
        .select('*')
        .or(`company_id.eq.${cid},company_id.is.null`)
        .order('sort_order', { ascending: true });
      if (error) return res.status(500).json({ error: error.message || 'Failed to list vendors.' });
      return res.json(data || []);
    }
    const { data, error } = await supabase.admin.from('vendors').select('*').order('sort_order', { ascending: true });
    if (error) return res.status(500).json({ error: error.message || 'Failed to list vendors.' });
    res.json(data || []);
  } catch (e) {
    console.error('[implementation/vendors GET]', e);
    res.status(500).json({ error: 'Failed to list vendors.' });
  }
});

router.post('/vendors', staffOnly, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required.' });
    const status = (req.body.status || 'active').trim();
    const notes = req.body.notes != null ? String(req.body.notes) : '';
    const sort_order = Number(req.body.sort_order) || 0;
    let company_id = req.body.company_id ?? null;
    if (req.user.role === 'admin') {
      company_id = req.user.companyId;
      if (!company_id) return res.status(400).json({ error: 'Admin profile has no company_id.' });
    }
    if (req.user.role === 'super_admin' && company_id === '') company_id = null;

    const { data, error } = await supabase.admin
      .from('vendors')
      .insert({ name, status, notes, sort_order, company_id })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message || 'Failed to create vendor.' });
    res.json(data);
  } catch (e) {
    console.error('[implementation/vendors POST]', e);
    res.status(500).json({ error: 'Failed to create vendor.' });
  }
});

router.patch('/vendors/:id', staffOnly, async (req, res) => {
  try {
    const vendor = await fetchVendorById(req.params.id);
    const scope = assertVendorScope(req, vendor);
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

    const patch = {};
    if (req.body.name != null) patch.name = String(req.body.name).trim();
    if (req.body.status != null) patch.status = String(req.body.status).trim();
    if (req.body.notes != null) patch.notes = String(req.body.notes);
    if (req.body.sort_order != null) patch.sort_order = Number(req.body.sort_order);
    if (req.user.role === 'super_admin' && req.body.company_id !== undefined) {
      patch.company_id = req.body.company_id || null;
    }

    const { data, error } = await supabase.admin.from('vendors').update(patch).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message || 'Failed to update vendor.' });
    res.json(data);
  } catch (e) {
    console.error('[implementation/vendors PATCH]', e);
    res.status(500).json({ error: 'Failed to update vendor.' });
  }
});

router.delete('/vendors/:id', staffOnly, async (req, res) => {
  try {
    const vendor = await fetchVendorById(req.params.id);
    const scope = assertVendorScope(req, vendor);
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
    const { error } = await supabase.admin.from('vendors').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message || 'Failed to delete vendor.' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[implementation/vendors DELETE]', e);
    res.status(500).json({ error: 'Failed to delete vendor.' });
  }
});

// ── Meetings (private per owner) ──

router.get('/meetings', staffOnly, async (req, res) => {
  try {
    let q = supabase.admin
      .from('vendor_meetings')
      .select('*')
      .eq('owner_profile_id', req.user.profileId)
      .order('scheduled_at', { ascending: true, nullsFirst: false });
    const vid = req.query.vendor_id;
    if (vid) q = q.eq('vendor_id', vid);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message || 'Failed to list meetings.' });
    res.json(data || []);
  } catch (e) {
    console.error('[implementation/meetings GET]', e);
    res.status(500).json({ error: 'Failed to list meetings.' });
  }
});

router.post('/meetings', staffOnly, async (req, res) => {
  try {
    const vendor_id = req.body.vendor_id;
    const title = (req.body.title || '').trim();
    if (!vendor_id || !title) return res.status(400).json({ error: 'vendor_id and title are required.' });
    const vendor = await fetchVendorById(vendor_id);
    const scope = assertVendorScope(req, vendor);
    if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

    const row = {
      vendor_id,
      owner_profile_id: req.user.profileId,
      title,
      scheduled_at: req.body.scheduled_at || null,
      meet_url: req.body.meet_url || null,
      recording_url: req.body.recording_url || null
    };
    const { data, error } = await supabase.admin.from('vendor_meetings').insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message || 'Failed to create meeting.' });
    res.json(data);
  } catch (e) {
    console.error('[implementation/meetings POST]', e);
    res.status(500).json({ error: 'Failed to create meeting.' });
  }
});

router.patch('/meetings/:id', staffOnly, async (req, res) => {
  try {
    const { data: existing, error: e1 } = await supabase.admin
      .from('vendor_meetings')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (e1 || !existing) return res.status(404).json({ error: 'Meeting not found.' });
    if (existing.owner_profile_id !== req.user.profileId) return res.status(403).json({ error: 'Forbidden.' });

    const patch = {};
    if (req.body.title != null) patch.title = String(req.body.title).trim();
    if (req.body.scheduled_at !== undefined) patch.scheduled_at = req.body.scheduled_at;
    if (req.body.meet_url !== undefined) patch.meet_url = req.body.meet_url;
    if (req.body.recording_url !== undefined) patch.recording_url = req.body.recording_url;
    if (req.body.vendor_id) {
      const vendor = await fetchVendorById(req.body.vendor_id);
      const scope = assertVendorScope(req, vendor);
      if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
      patch.vendor_id = req.body.vendor_id;
    }

    const { data, error } = await supabase.admin.from('vendor_meetings').update(patch).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message || 'Failed to update meeting.' });
    res.json(data);
  } catch (e) {
    console.error('[implementation/meetings PATCH]', e);
    res.status(500).json({ error: 'Failed to update meeting.' });
  }
});

router.delete('/meetings/:id', staffOnly, async (req, res) => {
  try {
    const { data: existing } = await supabase.admin.from('vendor_meetings').select('owner_profile_id').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Meeting not found.' });
    if (existing.owner_profile_id !== req.user.profileId) return res.status(403).json({ error: 'Forbidden.' });
    const { error } = await supabase.admin.from('vendor_meetings').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message || 'Failed to delete meeting.' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[implementation/meetings DELETE]', e);
    res.status(500).json({ error: 'Failed to delete meeting.' });
  }
});

// ── Tasks (owner only) ──

router.get('/tasks', staffOnly, async (req, res) => {
  try {
    const { data, error } = await supabase.admin
      .from('implementation_tasks')
      .select('*')
      .eq('owner_profile_id', req.user.profileId)
      .order('due_at', { ascending: true, nullsFirst: true });
    if (error) return res.status(500).json({ error: error.message || 'Failed to list tasks.' });
    res.json(data || []);
  } catch (e) {
    console.error('[implementation/tasks GET]', e);
    res.status(500).json({ error: 'Failed to list tasks.' });
  }
});

router.post('/tasks', staffOnly, async (req, res) => {
  try {
    const title = (req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title is required.' });
    let vendor_id = req.body.vendor_id || null;
    if (vendor_id) {
      const vendor = await fetchVendorById(vendor_id);
      const scope = assertVendorScope(req, vendor);
      if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
    }
    const row = {
      owner_profile_id: req.user.profileId,
      title,
      done: !!req.body.done,
      due_at: req.body.due_at || null,
      vendor_id,
      task_type: (req.body.task_type || 'general').trim()
    };
    const { data, error } = await supabase.admin.from('implementation_tasks').insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message || 'Failed to create task.' });
    res.json(data);
  } catch (e) {
    console.error('[implementation/tasks POST]', e);
    res.status(500).json({ error: 'Failed to create task.' });
  }
});

router.patch('/tasks/:id', staffOnly, async (req, res) => {
  try {
    const { data: existing } = await supabase.admin.from('implementation_tasks').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Task not found.' });
    if (existing.owner_profile_id !== req.user.profileId) return res.status(403).json({ error: 'Forbidden.' });
    const patch = {};
    if (req.body.title != null) patch.title = String(req.body.title).trim();
    if (req.body.done != null) patch.done = !!req.body.done;
    if (req.body.due_at !== undefined) patch.due_at = req.body.due_at;
    if (req.body.task_type != null) patch.task_type = String(req.body.task_type).trim();
    if (req.body.vendor_id !== undefined) {
      const vid = req.body.vendor_id;
      if (vid) {
        const vendor = await fetchVendorById(vid);
        const scope = assertVendorScope(req, vendor);
        if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
      }
      patch.vendor_id = vid;
    }
    const { data, error } = await supabase.admin.from('implementation_tasks').update(patch).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message || 'Failed to update task.' });
    res.json(data);
  } catch (e) {
    console.error('[implementation/tasks PATCH]', e);
    res.status(500).json({ error: 'Failed to update task.' });
  }
});

router.delete('/tasks/:id', staffOnly, async (req, res) => {
  try {
    const { data: existing } = await supabase.admin.from('implementation_tasks').select('owner_profile_id').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Task not found.' });
    if (existing.owner_profile_id !== req.user.profileId) return res.status(403).json({ error: 'Forbidden.' });
    const { error } = await supabase.admin.from('implementation_tasks').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message || 'Failed to delete task.' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[implementation/tasks DELETE]', e);
    res.status(500).json({ error: 'Failed to delete task.' });
  }
});

// ── Journal (owner only) ──

router.get('/journal', staffOnly, async (req, res) => {
  try {
    let q = supabase.admin
      .from('implementation_journal_entries')
      .select('*')
      .eq('owner_profile_id', req.user.profileId)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (req.query.from) q = q.gte('entry_date', req.query.from);
    if (req.query.to) q = q.lte('entry_date', req.query.to);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message || 'Failed to list journal.' });
    res.json(data || []);
  } catch (e) {
    console.error('[implementation/journal GET]', e);
    res.status(500).json({ error: 'Failed to list journal.' });
  }
});

router.post('/journal', staffOnly, async (req, res) => {
  try {
    const body = (req.body.body || '').trim();
    if (!body) return res.status(400).json({ error: 'body is required.' });
    const entry_date = req.body.entry_date || new Date().toISOString().slice(0, 10);
    const row = {
      owner_profile_id: req.user.profileId,
      body,
      entry_date
    };
    const { data, error } = await supabase.admin.from('implementation_journal_entries').insert(row).select().single();
    if (error) return res.status(500).json({ error: error.message || 'Failed to save journal entry.' });
    res.json(data);
  } catch (e) {
    console.error('[implementation/journal POST]', e);
    res.status(500).json({ error: 'Failed to save journal entry.' });
  }
});

router.patch('/journal/:id', staffOnly, async (req, res) => {
  try {
    const { data: existing } = await supabase.admin.from('implementation_journal_entries').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Entry not found.' });
    if (existing.owner_profile_id !== req.user.profileId) return res.status(403).json({ error: 'Forbidden.' });
    const patch = {};
    if (req.body.body != null) patch.body = String(req.body.body).trim();
    if (req.body.entry_date != null) patch.entry_date = String(req.body.entry_date).slice(0, 10);
    const { data, error } = await supabase.admin.from('implementation_journal_entries').update(patch).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message || 'Failed to update entry.' });
    res.json(data);
  } catch (e) {
    console.error('[implementation/journal PATCH]', e);
    res.status(500).json({ error: 'Failed to update entry.' });
  }
});

router.delete('/journal/:id', staffOnly, async (req, res) => {
  try {
    const { data: existing } = await supabase.admin
      .from('implementation_journal_entries')
      .select('owner_profile_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Entry not found.' });
    if (existing.owner_profile_id !== req.user.profileId) return res.status(403).json({ error: 'Forbidden.' });
    const { error } = await supabase.admin.from('implementation_journal_entries').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message || 'Failed to delete entry.' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[implementation/journal DELETE]', e);
    res.status(500).json({ error: 'Failed to delete entry.' });
  }
});

// ── Onboarding modules & progress ──

async function listModulesForProfile(profileId, companyId) {
  let q = supabase.admin.from('onboarding_modules').select('*').order('sort_order', { ascending: true });
  if (companyId) {
    q = q.or(`company_id.is.null,company_id.eq.${companyId}`);
  } else {
    q = q.is('company_id', null);
  }
  const { data: modules, error } = await q;
  if (error) throw error;
  const { data: progress } = await supabase.admin.from('onboarding_progress').select('*').eq('profile_id', profileId);
  const progMap = new Map((progress || []).map((p) => [p.module_key, p]));
  return (modules || []).map((m) => ({
    ...m,
    completed_at: progMap.get(m.key)?.completed_at ?? null,
    quiz_score: progMap.get(m.key)?.quiz_score ?? null
  }));
}

router.get('/onboarding/modules', async (req, res) => {
  try {
    if (!req.user?.profileId) return res.status(401).json({ error: 'Not authenticated.' });
    const modules = await listModulesForProfile(req.user.profileId, req.user.companyId);
    res.json(modules);
  } catch (e) {
    console.error('[implementation/onboarding/modules]', e);
    res.status(500).json({ error: e.message || 'Failed to load modules.' });
  }
});

router.get('/onboarding/my-progress', async (req, res) => {
  try {
    if (!req.user?.profileId) return res.status(401).json({ error: 'Not authenticated.' });
    const modules = await listModulesForProfile(req.user.profileId, req.user.companyId);
    const done = modules.filter((m) => m.completed_at).length;
    res.json({ modules, completed: done, total: modules.length });
  } catch (e) {
    console.error('[implementation/onboarding/my-progress]', e);
    res.status(500).json({ error: e.message || 'Failed to load progress.' });
  }
});

router.post('/onboarding/complete', async (req, res) => {
  try {
    if (!req.user?.profileId) return res.status(401).json({ error: 'Not authenticated.' });
    const moduleKey = (req.body.module_key || req.body.moduleKey || '').trim();
    if (!moduleKey) return res.status(400).json({ error: 'module_key is required.' });

    const { data: candidates } = await supabase.admin.from('onboarding_modules').select('key, company_id').eq('key', moduleKey);
    const mod = (candidates || []).find((m) => !m.company_id || m.company_id === req.user.companyId);
    if (!mod) return res.status(404).json({ error: 'Unknown module.' });
    if (mod.company_id != null && mod.company_id !== req.user.companyId) {
      return res.status(403).json({ error: 'Module not available for your company.' });
    }

    const row = {
      profile_id: req.user.profileId,
      module_key: moduleKey,
      completed_at: new Date().toISOString(),
      quiz_score: req.body.quiz_score != null ? Number(req.body.quiz_score) : null
    };
    const { data, error } = await supabase.admin.from('onboarding_progress').upsert(row).select().single();
    if (error) return res.status(500).json({ error: error.message || 'Failed to save progress.' });
    res.json(data);
  } catch (e) {
    console.error('[implementation/onboarding/complete]', e);
    res.status(500).json({ error: 'Failed to save progress.' });
  }
});

router.delete('/onboarding/complete/:moduleKey', async (req, res) => {
  try {
    if (!req.user?.profileId) return res.status(401).json({ error: 'Not authenticated.' });
    const moduleKey = (req.params.moduleKey || '').trim();
    if (!moduleKey) return res.status(400).json({ error: 'module_key is required.' });
    const { error } = await supabase.admin
      .from('onboarding_progress')
      .delete()
      .eq('profile_id', req.user.profileId)
      .eq('module_key', moduleKey);
    if (error) return res.status(500).json({ error: error.message || 'Failed to clear progress.' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[implementation/onboarding/complete DELETE]', e);
    res.status(500).json({ error: 'Failed to clear progress.' });
  }
});

router.get('/onboarding/report', staffOnly, async (req, res) => {
  try {
    let companyFilter = req.query.company_id || null;
    if (req.user.role === 'admin') {
      companyFilter = req.user.companyId;
      if (!companyFilter) return res.json([]);
    }

    let profQ = supabase.admin
      .from('profiles')
      .select('id, first_name, last_name, email, company_id')
      .eq('role', 'employee')
      .eq('is_active', true);
    if (companyFilter) profQ = profQ.eq('company_id', companyFilter);

    const { data: employees, error: e1 } = await profQ;
    if (e1) return res.status(500).json({ error: e1.message || 'Failed to load employees.' });

    const results = [];
    for (const emp of employees || []) {
      const modules = await listModulesForProfile(emp.id, emp.company_id);
      const done = modules.filter((m) => m.completed_at).length;
      results.push({
        profileId: emp.id,
        name: [emp.first_name, emp.last_name].filter(Boolean).join(' ') || emp.email || emp.id,
        email: emp.email,
        company_id: emp.company_id,
        completed: done,
        total: modules.length,
        modules
      });
    }
    res.json(results);
  } catch (e) {
    console.error('[implementation/onboarding/report]', e);
    res.status(500).json({ error: e.message || 'Failed to build report.' });
  }
});

module.exports = router;
