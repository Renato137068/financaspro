/**
 * billing/equipe.js — equipe: listar, convidar, aceitar, revogar e remover membros.
 *
 * Parte de BILLING (js/billing.js, que importa todas as partes): cada uma
 * acrescenta seus métodos ao mesmo objeto, criado em billing/base.js. Os
 * métodos continuam se chamando por BILLING.x.
 */

import { BILLING } from './base.js';
import { DADOS } from '../core/dados.js';

Object.assign(BILLING, {

  /** Membros + convites pendentes da org atual (nuvem). */
  listTeam: function() {
    if (!BILLING.isCloudUser()) {
      return Promise.reject(new Error('Equipe exige login na nuvem'));
    }
    if (typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
        && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive && SUPA_BILLING.isActive()) {
      return BILLING.ensureOrg().then(function(orgId) {
        return Promise.all([
          SUPA_BILLING.listMembers(orgId),
          SUPA_BILLING.listInvitations(orgId),
        ]).then(function(parts) {
          return { orgId: orgId, members: parts[0], invitations: parts[1] };
        });
      });
    }
    return BILLING.ensureOrg().then(function(orgId) {
      return Promise.all([
        DADOS._apiFetch('/api/v1/orgs/' + encodeURIComponent(orgId)),
        DADOS._apiFetch('/api/v1/orgs/' + encodeURIComponent(orgId) + '/invitations').catch(function() {
          return { data: [] };
        }),
      ]).then(function(parts) {
        var org = parts[0] || {};
        var inv = (parts[1] && parts[1].data) ? parts[1].data : (Array.isArray(parts[1]) ? parts[1] : []);
        var members = org.members || org.Members || [];
        return { orgId: orgId, members: members, invitations: inv, org: org };
      });
    });
  },

  inviteTeamMember: function(email, role) {
    var self = BILLING;
    email = String(email || '').trim().toLowerCase();
    if (!email || email.indexOf('@') < 1) {
      return Promise.reject(new Error('Informe um e-mail válido'));
    }
    if (!BILLING.canUse('teamFeatures')) {
      BILLING.onPaymentRequired({ message: 'Convite de membros está disponível a partir do plano Pro.' });
      return Promise.reject(new Error('upgrade-necessario'));
    }
    var limits = BILLING.getLimits();
    return BILLING.listTeam().then(function(team) {
      var seats = (team.members || []).length + (team.invitations || []).length;
      if (limits.maxUsers !== Infinity && seats >= limits.maxUsers) {
        var msg = limits.maxUsers <= 2
          ? 'Plano Pro permite até ' + limits.maxUsers + ' pessoas (modo casal).'
          : 'Limite de membros do plano atingido.';
        self.onPaymentRequired({ message: msg });
        var err = new Error(msg);
        err.status = 402;
        throw err;
      }
      if (typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
          && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive && SUPA_BILLING.isActive()) {
        return SUPA_BILLING.invoke('org-invite', {
          orgId: team.orgId,
          email: email,
          role: role || 'MEMBER',
        }).catch(function(err) {
          // Sem fallback para insert direto: isso pulava gate PRO+, teto de
          // assentos e e-mail. Edge ausente (404/503) = falha explícita.
          if (err && (err.status === 404 || err.status === 503)) {
            var unavailable = new Error(
              'Serviço de convites indisponível. Tente novamente em instantes.',
            );
            unavailable.status = err.status;
            unavailable.code = 'org-invite-unavailable';
            throw unavailable;
          }
          throw err;
        });
      }
      return DADOS._apiFetch('/api/v1/orgs/' + encodeURIComponent(team.orgId) + '/invite', {
        method: 'POST',
        body: JSON.stringify({ email: email, role: role || 'MEMBER' }),
      });
    });
  },

  acceptInvite: function(token) {
    if (!token) return Promise.reject(new Error('Convite inválido'));
    if (typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
        && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive && SUPA_BILLING.isActive()) {
      return SUPA_BILLING.acceptInvitation(token);
    }
    return DADOS._apiFetch('/api/v1/orgs/invitations/' + encodeURIComponent(token) + '/accept', {
      method: 'POST',
      body: '{}',
    });
  },

  inviteShareUrl: function(token) {
    var base = window.location.href.split('#')[0].split('?')[0];
    return base + '?invite=' + encodeURIComponent(token);
  },

  revokeInvite: function(invitationId) {
    if (!invitationId) return Promise.reject(new Error('Convite inválido'));
    if (typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
        && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive && SUPA_BILLING.isActive()) {
      return BILLING.ensureOrg().then(function(orgId) {
        return SUPA_BILLING.revokeInvitation(orgId, invitationId);
      });
    }
    return BILLING.ensureOrg().then(function(orgId) {
      return DADOS._apiFetch(
        '/api/v1/orgs/' + encodeURIComponent(orgId) + '/invitations/' + encodeURIComponent(invitationId),
        { method: 'DELETE' }
      );
    });
  },

  removeTeamMember: function(userId) {
    if (!userId) return Promise.reject(new Error('Membro inválido'));
    if (typeof DADOS !== 'undefined' && DADOS._supabaseAtivo && DADOS._supabaseAtivo()
        && typeof SUPA_BILLING !== 'undefined' && SUPA_BILLING.isActive && SUPA_BILLING.isActive()) {
      return BILLING.ensureOrg().then(function(orgId) {
        return SUPA_BILLING.removeMember(orgId, userId);
      });
    }
    return BILLING.ensureOrg().then(function(orgId) {
      return DADOS._apiFetch(
        '/api/v1/orgs/' + encodeURIComponent(orgId) + '/members/' + encodeURIComponent(userId),
        { method: 'DELETE' }
      );
    });
  },
});
