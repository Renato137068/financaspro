/**
 * supabase-billing.js — org, planos e Edge Functions de billing no Supabase.
 * Carrega depois de supabase.js (SB, SUPA_AUTH) e antes de billing.js.
 */
(function () {
  'use strict';

  if (typeof DADOS === 'undefined' || !DADOS._supabaseAtivo || !DADOS._supabaseAtivo()) {
    window.SUPA_BILLING = { isActive: function () { return false; } };
    return;
  }
  if (!window.SB || !window.SUPA_AUTH) {
    window.SUPA_BILLING = { isActive: function () { return false; } };
    return;
  }

  var SB = window.SB;

  function uid() {
    var s = SUPA_AUTH.getSessionSync();
    return s && s.user ? s.user.id : null;
  }

  function slugify(name) {
    return String(name || 'org')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'org';
  }

  function mapPlan(row) {
    if (!row) return null;
    var features = row.features;
    if (typeof features === 'string') {
      try { features = JSON.parse(features); } catch (e) { features = []; }
    }
    return {
      id: row.id,
      tier: row.tier,
      name: row.name,
      priceMonthly: Number(row.priceMonthly),
      priceYearly: Number(row.priceYearly),
      features: Array.isArray(features) ? features : [],
    };
  }

  function mapSubscription(row) {
    if (!row) return null;
    return {
      id: row.id,
      orgId: row.orgId,
      status: row.status,
      billingInterval: row.billingInterval,
      stripeCustomerId: row.stripeCustomerId,
      stripeSubId: row.stripeSubId,
      currentPeriodStart: row.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: !!row.cancelAtPeriodEnd,
      trialEndsAt: row.trialEndsAt,
      plan: mapPlan(row.plan),
    };
  }

  var SUPA_BILLING = {
    isActive: function () { return true; },

    invoke: function (name, body) {
      var base = (CONFIG.SUPABASE_URL || '').replace(/\/$/, '');
      var url = base + '/functions/v1/' + name;
      return SUPA_AUTH.getAccessToken().then(function (token) {
        if (!token) {
          var err = new Error('nao-autenticado');
          err.status = 401;
          throw err;
        }
        return fetch(url, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
            apikey: CONFIG.SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(body || {}),
        }).then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok) {
              var msg = (data && data.error) || 'erro-nuvem';
              var e = new Error(msg);
              e.status = res.status;
              throw e;
            }
            return data && data.data !== undefined ? data.data : data;
          });
        });
      });
    },

    listPlans: function () {
      return SB.from('Plan')
        .select('*')
        .eq('active', true)
        .order('priceMonthly', { ascending: true })
        .then(function (r) {
          if (r.error) throw r.error;
          return (r.data || []).map(mapPlan).filter(Boolean);
        });
    },

    ensureOrg: function () {
      var u = uid();
      if (!u) return Promise.reject(new Error('nao-autenticado'));

      return SB.from('OrganizationMember')
        .select('orgId, role')
        .eq('userId', u)
        .then(function (r) {
          if (r.error) throw r.error;
          var members = r.data || [];
          if (members.length) {
            var owner = null;
            for (var i = 0; i < members.length; i++) {
              if (members[i].role === 'OWNER') { owner = members[i]; break; }
            }
            return (owner || members[0]).orgId;
          }

          var nome = 'Minha Finanças';
          if (typeof DADOS !== 'undefined' && DADOS.getConfig) {
            var cfg = DADOS.getConfig();
            if (cfg && cfg.nome && cfg.nome !== 'Usuário' && cfg.nome !== 'Usuario') {
              nome = cfg.nome;
            }
          }
          var id = (typeof UTILS !== 'undefined' && UTILS.gerarUuid)
            ? UTILS.gerarUuid()
            : String(Date.now());
          var slug = slugify(nome) + '-' + id.slice(0, 8);
          var now = new Date().toISOString();

          return SB.from('Organization').insert({
            id: id,
            name: nome,
            slug: slug,
            ownerId: u,
            active: true,
            updatedAt: now,
          }).then(function (ins) {
            if (ins.error) throw ins.error;
            return id;
          });
        });
    },

    fetchSubscription: function (orgId) {
      return SB.from('Subscription')
        .select('*, plan:Plan(*)')
        .eq('orgId', orgId)
        .maybeSingle()
        .then(function (r) {
          if (r.error) throw r.error;
          if (!r.data) return null;
          return mapSubscription(r.data);
        });
    },
  };

  window.SUPA_BILLING = SUPA_BILLING;
})();
