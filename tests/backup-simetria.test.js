/**
 * backup-simetria.test.js — o que sai no backup consegue voltar?
 *
 * Origem: a auditoria de dimensões ocultas procurou o custo de saída do
 * produto e achou duas assimetrias no par exportar/importar:
 *
 *   1. `contas` não era exportado NEM importado. Toda transação guarda um
 *      `contaId`; depois de restaurar, o extrato inteiro mostrava banco em
 *      branco. O backup parecia completo — o arquivo tinha tudo que o usuário
 *      esperava ver — e não era.
 *   2. Existiam DOIS exportadores com formatos diferentes. O lembrete
 *      automático de backup usava o que o importador não sabe ler.
 *
 * Nenhum teste de unidade pegaria isso: cada função, isolada, está correta. O
 * defeito só existe na relação entre as duas. Por isso a checagem é
 * ESTRUTURAL — lê o código-fonte e compara os dois lados.
 *
 * Limite honesto: isto valida que cada campo exportado é lido na importação,
 * não que o valor sobrevive intacto à viagem. É a garantia que estava
 * faltando, não a garantia completa.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'modules', 'init-config.js'), 'utf8');

/** Corpo de uma função do objeto INIT_CONFIG, do cabeçalho até o `},` da coluna 2. */
function corpoDe(nome) {
  const inicio = src.indexOf(`  ${nome}: function`);
  if (inicio === -1) throw new Error(`função ${nome} não encontrada em init-config.js`);
  const fim = src.indexOf('\n  },', inicio);
  return src.slice(inicio, fim === -1 ? src.length : fim);
}

const exportBody = corpoDe('exportarDados');
const importBody = corpoDe('importarDados');

/** Chaves do literal `var exportData = { ... }`. */
function chavesExportadas() {
  const m = exportBody.match(/var exportData = \{([\s\S]*?)\n {8}\};/);
  if (!m) throw new Error('literal exportData não encontrado');
  // Só o nível superior: ignora linhas indentadas além do primeiro nível.
  return m[1]
    .split('\n')
    .map(l => l.match(/^ {10}([a-zA-Z_$][\w$]*):/))
    .filter(Boolean)
    .map(m2 => m2[1]);
}

// Campos que descrevem o arquivo em vez de carregarem dado do usuário. Não
// precisam ser importados — mas precisam estar declarados aqui, para que
// ninguém silencie um campo de dado real jogando-o nesta lista sem pensar.
const INFORMATIVOS = new Set(['versao', 'dataExportacao', 'metadados']);

describe('backup — simetria entre exportar e importar', () => {
  test('a leitura do código encontrou os dois lados', () => {
    // Guarda contra o teste virar vacuamente verde se init-config for
    // reorganizado e os regex pararem de casar.
    expect(chavesExportadas().length).toBeGreaterThan(4);
    expect(importBody).toContain('data.transacoes');
  });

  test('todo campo de dado exportado é lido na importação', () => {
    const naoImportados = chavesExportadas()
      .filter(k => !INFORMATIVOS.has(k))
      .filter(k => !new RegExp(`data\\.${k}\\b`).test(importBody));

    expect(naoImportados).toEqual([]);
  });

  test('tudo que o app persiste aparece no backup', () => {
    // Este é o teste que faltava. A checagem de simetria acima compara os dois
    // lados do backup entre si — e passava mesmo com `contas` ausente, porque
    // estava ausente dos DOIS. Omissão simétrica continua sendo omissão.
    //
    // Aqui a referência é externa: as chaves de armazenamento declaradas em
    // CONFIG. Se o app guarda algo, ou esse algo entra no backup, ou está
    // declarado abaixo como intencionalmente descartável.
    const config = fs.readFileSync(path.join(root, 'js', 'core', 'config.js'), 'utf8');
    const chavesArmazenadas = [...config.matchAll(/STORAGE_([A-Z_]+):/g)].map(m => m[1].toLowerCase());

    // Dado que não deve viajar num backup, com o motivo explícito.
    const NAO_EXPORTAVEIS = {
      rascunho: 'formulário meio preenchido — restaurar seria confuso',
      aprendizado: 'histórico de categorização; recriado pelo uso, e carrega padrão de gasto',
    };

    const exportadas = chavesExportadas();
    const esquecidas = chavesArmazenadas.filter(
      k => !exportadas.includes(k) && !(k in NAO_EXPORTAVEIS),
    );

    expect(esquecidas).toEqual([]);
  });

  test('contas bancárias entram no backup', () => {
    // Sem elas, o contaId de cada transação restaurada aponta para o nada.
    expect(exportBody).toMatch(/contas:\s*DADOS\.getContas\(\)/);
    expect(importBody).toContain('data.contas');
    expect(importBody).toContain('DADOS.salvarContas');
  });

  test('anexos entram no backup', () => {
    expect(chavesExportadas()).toContain('anexos');
    expect(importBody).toContain('ANEXOS.importarTodos');
  });

  test('orçamentos entram no backup', () => {
    expect(chavesExportadas()).toContain('orcamentos');
    expect(importBody).toContain('data.orcamentos');
  });
});

describe('backup — um único formato', () => {
  const configUser = fs.readFileSync(path.join(root, 'js', 'config-user.js'), 'utf8');
  const dados = fs.readFileSync(path.join(root, 'js', 'core', 'dados.js'), 'utf8');

  test('CONFIG_USER.exportarDados delega em vez de gerar formato próprio', () => {
    // Dois exportadores com o mesmo rótulo na tela produziam arquivos
    // diferentes, e só um deles restaurava.
    const corpo = configUser.slice(
      configUser.indexOf('  exportarDados: function'),
      configUser.indexOf('\n  },', configUser.indexOf('  exportarDados: function')),
    );
    expect(corpo).toContain('INIT_CONFIG.exportarDados');
    expect(corpo).not.toContain('DADOS.exportarDados');
  });

  test('DADOS.exportarDados está marcado como snapshot, não como backup', () => {
    // Continua existindo como leitura crua do armazenamento; o comentário
    // impede que volte a ser ligado a um botão de "exportar backup".
    const antes = dados.slice(Math.max(0, dados.indexOf('exportarDados: function') - 400),
      dados.indexOf('exportarDados: function'));
    expect(antes).toMatch(/NÃO é o formato de backup/);
  });

  test('só existe um caminho de exportação ligado à UI', () => {
    const jsDir = path.join(root, 'js');
    const arquivos = [];
    (function varrer(dir) {
      for (const nome of fs.readdirSync(dir)) {
        const p = path.join(dir, nome);
        if (fs.statSync(p).isDirectory()) varrer(p);
        else if (nome.endsWith('.js')) arquivos.push(p);
      }
    })(jsDir);

    // Quem cria um link de download com nome de backup está gerando um
    // formato. Deve haver exatamente um.
    // A busca é por NOME DE PRODUTO qualquer, não pelo nome atual: quando o app
    // foi renomeado de FinançasPro para Sobra este teste quebrou por citar a
    // marca antiga, e um teste de arquitetura não deveria depender do nome
    // comercial. Agora ele casa com qualquer prefixo seguido de _backup_.
    const geradores = arquivos.filter(f => {
      const s = fs.readFileSync(f, 'utf8');
      return /link\.download\s*=\s*'[a-z0-9]+[_-]backup[_-]/i.test(s)
        || /download.*[a-z0-9]+[_-]backup|[a-z0-9]+[_-]backup.*download/is.test(s);
    });

    expect(geradores.map(f => path.relative(root, f))).toEqual([
      path.join('js', 'modules', 'init-config.js'),
    ]);
  });
});
