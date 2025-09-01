const express = require('express');
const multer = require('multer');
const mysql = require('mysql');
const path = require('path');
const fs = require('fs');

const ProfessorRouter = require('./backend/roteador/ProfessorRouter');
const AlunoRouter = require('./backend/roteador/AlunoRouter');
const CoordenadorRouter = require('./backend/roteador/CoordenadorRouter');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'frontend'))); 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const porta = 3000; 
const host = `http://localhost:${porta}`;

const banco = mysql.createPool({
    connectionLimit: 128,
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'tcc2025'
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const pasta = 'uploads/' + new Date().toISOString().split('T')[0];
        fs.mkdirSync(pasta, { recursive: true });
        cb(null, pasta);
    },
    filename: function (req, file, cb) {
        const nomeUnico = Date.now() + '-' + file.originalname;
        cb(null, nomeUnico);
    }
});

const upload = multer({ storage: storage });

const rotasProfessor = new ProfessorRouter(app, banco);
const rotasAlunos = new AlunoRouter(app, banco)
const rotasCoordenadores = new CoordenadorRouter(app, banco)

rotasProfessor.createRoutes(); 
rotasAlunos.createRoutes();
rotasCoordenadores.createRoutes();

app.get('/login', function(req, res){
    res.sendFile(__dirname + "/frontend/login.html");  
});

app.post('/login', function(req, res) {
    const email = req.body.email;
    const senha = req.body.senha;

    if (!email || !senha) {
        return res.status(400).send('Email e senha são obrigatórios!');
    }

    // checa aluno
    banco.query(
        'SELECT * FROM aluno WHERE emailAluno = ? AND senhaAluno = ?',
        [email, senha],
        (erro, resultados) => {
            if (erro) {
                console.error('Erro na consulta de alunos:', erro);
                return res.status(500).send('Erro interno no servidor');
            }
            if (resultados.length > 0) {
                if (req.session) {
                    req.session.user = { tipo: 'aluno', id: resultados[0].idAluno, nome: resultados[0].nomeAluno };
                }
                return res.redirect('/alunos');
            }

            // checa professor (agora inclui coordenadores)
            banco.query(
                'SELECT * FROM professor WHERE emailProfessor = ? AND senhaProfessor = ?',
                [email, senha],
                (erro2, resultados2) => {
                    if (erro2) {
                        console.error('Erro na consulta de professores:', erro2);
                        return res.status(500).send('Erro interno no servidor');
                    }

                    if (resultados2.length > 0) {
                        const user = resultados2[0];
                        let tipo = 'professor';
                        
                        // Verifica se é coordenador
                        if (user.isCoordenador) {
                            tipo = 'coordenador';
                        }
                        
                        if (req.session) {
                            req.session.user = { tipo: tipo, id: user.idProfessor, nome: user.nomeProfessor };
                        }
                        
                        if (tipo === 'coordenador') {
                            return res.redirect('/coordenadores');
                        } else {
                            return res.redirect('/professores');
                        }
                    }

                    return res.status(401).send('Credenciais inválidas');
                }
            );
        }
    );
});

app.get('/api/professores', (req, res) => {
    banco.query('SELECT idProfessor, nomeProfessor FROM professor ORDER BY nomeProfessor', (erro, resultados) => {
        if (erro) {
            console.error('Erro ao buscar professores:', erro);
            return res.status(500).json({ message: 'Erro interno no servidor' });
        }
        res.json(resultados);
    });
});

app.get('/api/cursos', (req, res) => {
    banco.query('SELECT idCurso, nomeCurso FROM curso ORDER BY nomeCurso', (erro, resultados) => {
        if (erro) {
            console.error('Erro ao buscar cursos:', erro);
            return res.status(500).json({ message: 'Erro interno no servidor' });
        }
        res.json(resultados);
    });
});

app.get('/api/alunos/search', (req, res) => {
    const nome = req.query.nome;
    if (!nome) {
        return res.json([]);
    }

    const sql = `
        SELECT *
        FROM aluno 
        WHERE nomeAluno LIKE ?;
    `;
    
    banco.query(sql, [`%${nome}%`], (erro, resultados) => {
        if (erro) {
            console.error('Erro ao buscar alunos:', erro);
            return res.status(500).json({ message: 'Erro interno no servidor' });
        }
        res.json(resultados);
    });
});

// ROTA para exibir página de criação de atividade
app.get('/criar-atividade', function(req, res) {
    res.sendFile(__dirname + "/frontend/criar-atividade.html");
});

// ROTA para criar nova atividade
app.post('/api/atividades', function(req, res) {
    const { nomeAtividade, sequencia, dataEntrega } = req.body;

    if (!nomeAtividade || !sequencia || !dataEntrega) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
    }

    const sql = 'INSERT INTO atividade (nomeAtividade, sequencia, dataEntrega, dataPostagem) VALUES (?, ?, ?, CURDATE())';
    
    banco.query(sql, [nomeAtividade, sequencia, dataEntrega], (erro, resultado) => {
        if (erro) {
            console.error('Erro ao criar atividade:', erro);
            return res.status(500).json({ message: 'Erro interno no servidor' });
        }
        res.status(201).json({ message: 'Atividade criada com sucesso!' });
    });
});

// ROTA para exibir página de cadastro de coordenadores
app.get('/cadastro-coordenador', (req, res) => {
    res.sendFile(__dirname + "/frontend/cadastroCoordenador.html");
});

// ROTA para cadastrar coordenador no banco (como professor com isCoordenador = true)
app.get('/cadastro-coordenador', (req, res) => {
    res.sendFile(__dirname + "/frontend/cadastroCoordenador.html");
});

// ROTA para cadastrar coordenador no banco (como professor com isCoordenador = true)
app.post('/cadastro-coordenador', (req, res) => {
    const { nomeProfessor, emailProfessor, senhaProfessor } = req.body;

    if (!nomeProfessor || !emailProfessor || !senhaProfessor) {
        return res.status(400).send('Preencha todos os campos.');
    }

    const sql = 'INSERT INTO professor (nomeProfessor, emailProfessor, senhaProfessor, isCoordenador) VALUES (?, ?, ?, ?)';
    banco.query(sql, [nomeProfessor, emailProfessor, senhaProfessor, 1], (erro, resultado) => {
        if (erro) {
            console.error("Erro ao cadastrar coordenador:", erro);
            return res.status(500).send("Erro ao cadastrar coordenador.");
        }
        res.redirect('/login');
    });
});

// ROTA para exibir página de cadastro de alunos
app.get('/cadastro-aluno', (req, res) => {
    res.sendFile(__dirname + "/frontend/cadastroAluno.html");
});

// ROTA para cadastrar aluno no banco
app.post('/cadastro-aluno', (req, res) => {
    const { nomeAluno, emailAluno, senhaAluno, idCurso } = req.body;

    if (!nomeAluno || !emailAluno || !senhaAluno || !idCurso) {
        return res.status(400).send('Preencha todos os campos.');
    }

    const sql = 'INSERT INTO aluno (nomeAluno, emailAluno, senhaAluno, idCurso) VALUES (?, ?, ?, ?)';
    banco.query(sql, [nomeAluno, emailAluno, senhaAluno, idCurso], (erro, resultado) => {
        if (erro) {
            console.error("Erro ao cadastrar aluno:", erro);
            return res.status(500).send("Erro ao cadastrar aluno.");
        }
        res.redirect('/login');
    });
});

// ROTA para exibir página de cadastro de alunos
app.get('/cadastro-professor', (req, res) => {
    res.sendFile(__dirname + "/frontend/cadastroProfessor.html");
});

// ROTA para cadastrar professor no banco (com isCoordenador = false)
app.post('/cadastro-professor', (req, res) => {
    const { nomeProfessor, emailProfessor, senhaProfessor } = req.body;

    if (!nomeProfessor || !emailProfessor || !senhaProfessor) {
        return res.status(400).send('Preencha todos os campos.');
    }

    const sql = 'INSERT INTO professor (nomeProfessor, emailProfessor, senhaProfessor, isCoordenador) VALUES (?, ?, ?, ?)';
    banco.query(sql, [nomeProfessor, emailProfessor, senhaProfessor, 0], (erro, resultado) => {
        if (erro) {
            console.error("Erro ao cadastrar professor:", erro);
            return res.status(500).send("Erro ao cadastrar professor.");
        }
        res.redirect('/login');
    });
});

// ROTA para criar um novo grupo e associar os membros
app.post('/api/grupos', (req, res) => {
    const { tema, idProfessor, idAlunos, idCurso } = req.body;

    if (!tema || !idProfessor || !idAlunos || idAlunos.length === 0 || !idCurso) {
        return res.status(400).json({ message: 'Dados incompletos para criar o grupo.' });
    }

    banco.getConnection((err, connection) => {
        if (err) {
            console.error('Erro ao obter conexão do banco:', err);
            return res.status(500).json({ message: 'Erro interno no servidor.' });
        }

        connection.beginTransaction(err => {
            if (err) {
                connection.release();
                return res.status(500).json({ message: 'Erro ao iniciar a transação.' });
            }

            // Inserir o novo grupo na tabela 'grupotcc'
            const sqlGrupo = 'INSERT INTO grupotcc (tema, idCurso, idProfessor, status) VALUES (?, ?, ?, "pendente")';
            connection.query(sqlGrupo, [tema, idCurso, idProfessor], (erro, resultadoGrupo) => {
                if (erro) {
                    return connection.rollback(() => {
                        connection.release();
                        console.error('Erro ao inserir grupo:', erro);
                        res.status(500).json({ message: 'Falha ao criar o grupo.' });
                    });
                }

                const idNovoGrupo = resultadoGrupo.insertId;

                // Preparar os dados para inserir na tabela 'aluno_grupo'
                const valoresAlunoGrupo = idAlunos.map(idAluno => [idNovoGrupo, idAluno]);
                const sqlAlunoGrupo = 'INSERT INTO aluno_grupo (idGrupo, idAluno) VALUES ?';

                connection.query(sqlAlunoGrupo, [valoresAlunoGrupo], (erro, resultadoAlunos) => {
                    if (erro) {
                        return connection.rollback(() => {
                            connection.release();
                            console.error('Erro ao associar alunos ao grupo:', erro);
                            res.status(500).json({ message: 'Falha ao adicionar membros ao grupo.' });
                        });
                    }

                    // Se tudo deu certo, comita a transação
                    connection.commit(err => {
                        if (err) {
                            return connection.rollback(() => {
                                connection.release();
                                res.status(500).json({ message: 'Falha ao confirmar a criação do grupo.' });
                            });
                        }
                        
                        connection.release();
                        res.status(201).json({ message: 'Grupo criado com sucesso!' });
                    });
                });
            });
        });
    });
});

// ROTA: lista grupos com membros e quantidade de arquivos (resumo)
app.get('/api/grupos-resumo', (req, res) => {
  const sql = `
    SELECT 
      g.idGrupo,
      g.tema,
      g.status,
      GROUP_CONCAT(DISTINCT a.nomeAluno SEPARATOR '||') AS membros,
      COUNT(DISTINCT e.idEntrega) AS qtdArquivos
    FROM grupotcc g
    LEFT JOIN aluno_grupo ag ON g.idGrupo = ag.idGrupo
    LEFT JOIN aluno a ON ag.idAluno = a.idAluno
    LEFT JOIN entregas e ON e.grupotcc_idGrupo = g.idGrupo
    GROUP BY g.idGrupo, g.tema, g.status
    ORDER BY g.tema ASC
  `;

  banco.query(sql, (erro, resultados) => {
    if (erro) {
      console.error('Erro ao buscar resumo de grupos:', erro);
      return res.status(500).json({ error: 'Erro interno' });
    }

    // transformar membros em array
    const dados = resultados.map(r => ({
      idGrupo: r.idGrupo,
      tema: r.tema,
      status: r.status,
      membros: r.membros ? r.membros.split('||') : [],
      qtdArquivos: r.qtdArquivos || 0
    }));

    res.json(dados);
  });
});

// ROTA para aprovar/recusar grupos (para coordenadores/professores)
app.put('/api/grupos/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['aprovado', 'recusado'].includes(status)) {
        return res.status(400).json({ message: 'Status inválido' });
    }

    const sql = "UPDATE grupotcc SET status = ? WHERE idGrupo = ?";
    banco.query(sql, [status, id], (err) => {
        if (err) {
            console.error('Erro ao atualizar status do grupo:', err);
            return res.status(500).json({ message: 'Erro ao atualizar status do grupo' });
        }
        res.json({ message: `Status do grupo atualizado para ${status}` });
    });
});

app.get('/api/temas', (req, res) => {
    const { q } = req.query;

    if (!q || q.trim() === '') return res.json([]);

    const termo = `%${q.trim()}%`;

    const sql = `
        SELECT tema 
        FROM grupotcc 
        WHERE tema LIKE ? AND status = 'aprovado'
        LIMIT 5
    `;

    banco.query(sql, [termo], (err, resultados) => {
        if (err) {
            console.error('Erro ao buscar temas:', err);
            return res.status(500).json({ message: 'Erro interno.' });
        }

        res.json(resultados.map(r => r.tema));
    });
});

app.use('/professores', function(req, res) {
    res.sendFile(__dirname + "/frontend/professores.html")
});

app.use('/alunos', function(req, res) {
   res.sendFile(__dirname + "/frontend/alunos.html")
});

app.use('/coordenadores', function(req, res) {
   res.sendFile(__dirname + "/frontend/coordenadores.html")
});

app.use('/cadastrargrupo', function(req, res) {
   res.sendFile(__dirname + "/frontend/cadastrargrupo.html")
});

app.use('/entrega', function(req, res) {
   res.sendFile(__dirname + "/frontend/entrega.html")
});

app.post('/enviar-arquivo', upload.single('arquivoEnviado'), (req, res) => {
    const { idAtividade, idGrupo } = req.body;

    if (!req.file) {
        return res.status(400).send('Nenhum arquivo foi enviado.');
    }

    const nomeOriginal = req.file.originalname;
    const nomeServidor = req.file.filename;
    const caminhoArquivo = req.file.path;

    const sql = `
        INSERT INTO entregas (nome_original, nome_servidor, caminho_arquivo, atividade_idatividade, grupotcc_idGrupo)
        VALUES (?, ?, ?, ?, ?)
    `;

    banco.query(sql, [nomeOriginal, nomeServidor, caminhoArquivo, idAtividade, idGrupo], (erro, resultados) => {
        if (erro) {
            console.error('Erro ao salvar no banco:', erro);
            return res.status(500).send('Erro ao salvar as informações do arquivo.');
        }
        console.log('Arquivo salvo com sucesso!');
        res.send('Arquivo enviado com sucesso!');
    });
});

app.get('/api/entregas', (req, res) => {
    const sql = `
        SELECT e.idEntrega, e.nome_original, e.data_envio, a.nomeAtividade, g.tema
        FROM entregas e
        INNER JOIN atividade a ON e.atividade_idatividade = a.idatividade
        INNER JOIN grupotcc g ON e.grupotcc_idGrupo = g.idGrupo
        ORDER BY e.data_envio DESC
    `;

    banco.query(sql, (erro, resultados) => {
        if (erro) {
            console.error('Erro ao buscar entregas:', erro);
            return res.status(500).json({ erro: 'Erro interno no servidor' });
        }
        res.json(resultados);
    });
});

app.get('/download/:id', (req, res) => {
    const entregaId = req.params.id;
    const sql = 'SELECT caminho_arquivo, nome_original FROM entregas WHERE idEntrega = ?';

    banco.query(sql, [entregaId], (erro, resultados) => {
        if (erro || resultados.length === 0) {
            return res.status(404).send('Arquivo não encontrado.');
        }

        const caminho = resultados[0].caminho_arquivo;
        const nomeOriginal = resultados[0].nome_original;

        res.download(caminho, nomeOriginal, (errDownload) => {
            if (errDownload) {
                console.error("Erro no download:", errDownload);
            }
        });
    });
});

app.use('/', function(req, res){
    res.sendFile(__dirname + "/frontend/inicial.html");  
});

app.listen(porta, () => {
    console.log('Conexão Estabelecida');
    console.log(`Servidor rodando na porta ${porta}`);
    console.log(`Acesse em: ${host}`);
});