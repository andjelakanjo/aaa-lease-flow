const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const log = require('../lib/logger');

function staffOnly(req, res, next) {
  if (!['admin', 'super_admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'PYA proposal requires admin or super admin.' });
  }
  next();
}

// GET /api/proposal/data — sections, checklist items, notes (merged on server)
router.get('/data', staffOnly, async (req, res) => {
  try {
    const { data: sections, error: e1 } = await supabase.admin
      .from('proposal_sections')
      .select('id, title_sr, title_en, order_index')
      .order('order_index', { ascending: true });
    if (e1) return res.status(500).json({ error: e1.message || 'Failed to load sections.' });

    const { data: items, error: e2 } = await supabase.admin
      .from('proposal_checklist_items')
      .select(
        'id, section_id, title_sr, title_en, detail_sr, detail_en, is_checked, order_index, updated_at'
      )
      .order('order_index', { ascending: true });
    if (e2) return res.status(500).json({ error: e2.message || 'Failed to load checklist.' });

    const { data: notes, error: e3 } = await supabase.admin
      .from('proposal_notes')
      .select('id, item_id, content, author, created_at')
      .order('created_at', { ascending: true });
    if (e3) return res.status(500).json({ error: e3.message || 'Failed to load notes.' });

    res.json({
      sections: sections || [],
      items: items || [],
      notes: notes || []
    });
  } catch (e) {
    log.error({ err: e }, '[proposal/data]');
    res.status(500).json({ error: 'Failed to load proposal data.' });
  }
});

router.patch('/checklist/:id', staffOnly, async (req, res) => {
  try {
    const id = req.params.id;
    if (req.body?.is_checked === undefined) {
      return res.status(400).json({ error: 'is_checked is required.' });
    }
    const is_checked = Boolean(req.body.is_checked);
    const { data, error } = await supabase.admin
      .from('proposal_checklist_items')
      .update({ is_checked, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message || 'Failed to update item.' });
    if (!data) return res.status(404).json({ error: 'Item not found.' });
    res.json(data);
  } catch (e) {
    log.error({ err: e }, '[proposal/checklist PATCH]');
    res.status(500).json({ error: 'Failed to update item.' });
  }
});

router.post('/notes', staffOnly, async (req, res) => {
  try {
    const item_id = req.body?.item_id;
    const content = (req.body?.content || '').trim();
    if (!item_id || !content) return res.status(400).json({ error: 'item_id and content are required.' });
    const author =
      [req.user.firstName, req.user.lastName].filter(Boolean).join(' ').trim() ||
      req.user.email ||
      'Admin';
    const { data, error } = await supabase.admin
      .from('proposal_notes')
      .insert({ item_id, content, author })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message || 'Failed to save note.' });
    res.json(data);
  } catch (e) {
    log.error({ err: e }, '[proposal/notes POST]');
    res.status(500).json({ error: 'Failed to save note.' });
  }
});

module.exports = router;
