// Conteúdo para o arquivo: index.js
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(cors({ origin: true })); // Permite requisições do seu domínio Firebase
app.use(express.json());

// Inicializa o Firebase Admin
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Middleware de segurança: verifica a credencial do administrador
const checkAuth = async (req, res, next) => {
  if (req.headers.authorization?.startsWith('Bearer ')) {
    const idToken = req.headers.authorization.split('Bearer ')[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      // Opcional: Verificar se o admin tem uma role específica
      // const userRecord = await admin.auth().getUser(decodedToken.uid);
      // if (userRecord.customClaims?.role !== 'administrador') {
      //   throw new Error("Permissão negada.");
      // }
      req.user = decodedToken; // Anexa os dados do admin à requisição
      next();
    } catch (error) {
      console.error("Token inválido ou expirado:", error);
      res.status(401).send({ error: "Autenticação inválida." });
    }
  } else {
    res.status(401).send({ error: "Credencial de autenticação não encontrada." });
  }
};

// Rota de teste
app.get("/", (req, res) => {
  res.send("API do TudoOkFaltandoFinanceiro está no ar!");
});

// Rota para criar o sócio (protegida pelo checkAuth)
app.post("/criarSocio", checkAuth, async (req, res) => {
  console.log("Admin autenticado:", req.user.email);
  const { nome, email, cpf, dob, telefone, endereco, planoId, passportId } = req.body;

  if (!email || !nome) {
      return res.status(400).send({ error: "Nome e E-mail são obrigatórios." });
  }

  try {
    // Passo 1: Criar o usuário no Firebase Authentication
    const userRecord = await admin.auth().createUser({
        email: email,
        displayName: nome,
        // O usuário é criado sem senha. Ele a definirá pelo link de "reset".
    });
    const uid = userRecord.uid;
    console.log("Usuário criado com sucesso no Authentication:", uid);

    // Passo 2: Salvar os dados unificados no Firestore
    const dadosSocio = {
      uid: uid,
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

    await db.collection("users").doc(uid).set(dadosSocio);
    console.log(`Documento salvo no Firestore para o UID: ${uid}`);
    res.status(200).send({ status: "success", message: "Sócio criado com sucesso!", uid: uid });

  } catch (error) {
    console.error("Erro no processo de criação:", error);
    if (error.code === 'auth/email-already-exists') {
        return res.status(409).send({ error: "O e-mail fornecido já está em uso." });
    }
    res.status(500).send({ error: "Ocorreu um erro interno no servidor." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
