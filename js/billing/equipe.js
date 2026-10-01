/**
 * billing/equipe.js — equipe: listar, convidar, aceitar, revogar e remover membros.
 *
 * Parte de BILLING (js/billing.js, que importa todas as partes): cada uma
 * acrescenta seus métodos ao mesmo objeto, criado em billing/base.js. Os
 * métodos continuam se chamando por BILLING.x.
 */

import { BILLING } from './base.js';

Object.assign(BILLING, {

  /** Membros + convites pendentes da org atual (nuvem). */
  listTeam: function() {
    if (!BILLING.isCloudUser()) {
      return Promise.reject(new Error('Equipe exige login na nuvem'));
    }
    return BILLING.ensureOrg().then(function(orgId) {
      return Promise.all([
        SUPA_BILLING.listMembers(orgId),
        SUPA_BILLING.listInvitations(orgId),
      ]).then(function(parts) {
        return { orgId: orgId, members: parts[0], invitations: parts[1] };
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
    });
  },

  acceptInvite: function(token) {
    if (!token) return Promise.reject(new Error('Convite inválido'));
    if (!BILLING._useSupabaseBilling()) return Promise.reject(BILLING._semNuvem());
    return SUPA_BILLING.acceptInvitation(token);
  },

  inviteShareUrl: function(token) {
    var base = window.location.href.split('#')[0].split('?')[0];
    return base + '?invite=' + encodeURIComponent(token);
  },

  revokeInvite: function(invitationId) {
    if (!invitationId) return Promise.reject(new Error('Convite inválido'));
    return BILLING.ensureOrg().then(function(orgId) {
      return SUPA_BILLING.revokeInvitation(orgId, invitationId);
    });
  },

  removeTeamMember: function(userId) {
    if (!userId) return Promise.reject(new Error('Membro inválido'));
    return BILLING.ensureOrg().then(function(orgId) {
      return SUPA_BILLING.removeMember(orgId, userId);
    });
  },
});
