// Versão Final e Corrigida do index.js
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Middleware de segurança: verifica o ID Token
const checkAuth = async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    const idToken = req.headers.authorization.split('Bearer ')[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      req.user = decodedToken;
      next();
    } catch (error) {
      console.error("Erro ao verificar token:", error);
      res.status(401).send({ error: "Autenticação inválida." });
    }
  } else {
    res.status(401).send({ error: "Credencial de autenticação não encontrada." });
  }
};

app.get("/", (req, res) => {
  res.send("API do TudoOkFaltandoFinanceiro está no ar!");
});

// Rota para criar o sócio (APENAS SALVA NO FIRESTORE)
app.post("/criarSocio", checkAuth, async (req, res) => {
  console.log("Recebida requisição para criar sócio para o UID:", req.user.uid);
  try {
    // O UID do admin que está criando o sócio
    const adminUid = req.user.uid;
    const { nome, email, cpf, dob, telefone, endereco, planoId, passportId } = req.body;

    // A tarefa do backend agora é SÓ salvar os dados
    const dadosSocio = {
      // ATENÇÃO: O uid aqui ainda é do admin, vamos precisar corrigir isso no futuro
      // mas por agora, o importante é salvar.
      uid: adminUid, 
      role: "Sócio",
      passportId: passportId,
      planId: planoId,
      status: "ativo",
      creationDate: admin.firestore.FieldValue.serverTimestamp(),
      financialResponsible_name: nome,
      financialResponsible_cpf: cpf,
      financialResponsible_dob: dob,
      financialResponsible_email: email,
      financialResponsible_phone: telefone,
      financialResponsible_address: endereco,
    };

    // Usaremos o passportId como ID do documento na coleção 'users'
    await db.collection("users").doc(passportId).set(dadosSocio);
    console.log(`Documento do sócio salvo no Firestore com ID: ${passportId}`);
    res.status(200).send({ status: "success", message: "Sócio criado com sucesso!", passportId: passportId });

  } catch (error) {
    console.error("Erro ao criar sócio:", error);
    res.status(500).send({ status: "error", message: "Ocorreu um erro no servidor." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
