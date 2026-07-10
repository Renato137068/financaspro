/**
 * belvo.test.js — helpers Belvo (sem chamadas de rede)
 */
const fs = require('fs');
const path = require('path');

describe('Belvo adapter', function() {
  var belvoSrc;

  beforeAll(function() {
    belvoSrc = fs.readFileSync(
      path.join(__dirname, '..', 'backend/lib/open-finance/belvo.js'),
      'utf8',
    );
  });

  test('expõe createBelvoWidgetToken e buildBelvoWidgetUrl', function() {
    expect(belvoSrc).toContain('createBelvoWidgetToken');
    expect(belvoSrc).toContain('buildBelvoWidgetUrl');
    expect(belvoSrc).toContain('widget.belvo.io');
  });

  test('usa sandbox.belvo.com por padrão', function() {
    expect(belvoSrc).toContain('sandbox.belvo.com');
  });

  test('deleteBelvoLink remove link na API', function() {
    expect(belvoSrc).toContain('deleteBelvoLink');
    expect(belvoSrc).toContain("method: 'DELETE'");
  });
});
