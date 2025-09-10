// Versão Definitiva do index.js (Backend)
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Inicializa o Firebase Admin lendo as credenciais da variável de ambiente segura
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Middleware de segurança: Verifica se o usuário administrador está autenticado
const checkAuth = async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    const idToken = req.headers.authorization.split('Bearer ')[1];
    try {
      // Verifica se a credencial (ID Token) é válida
      req.user = await admin.auth().verifyIdToken(idToken);
      next(); // Se for válida, permite que a requisição continue
    } catch (error) {
      console.error("Token inválido:", error);
      res.status(401).send({ error: "Autenticação inválida." });
    }
  } else {
    res.status(401).send({ error: "Credencial de autenticação não encontrada." });
  }
};

// Rota de teste para verificar se a API está no ar
app.get("/", (req, res) => {
  res.send("API do TudoOkFaltandoFinanceiro está no ar!");
});

// Rota final e segura para criar o sócio
app.post("/criarSocio", checkAuth, async (req, res) => {
  const { nome, email, cpf, dob, telefone, endereco, planId } = req.body;
  const adminUid = req.user.uid;
  console.log(`Admin ${adminUid} iniciando criação para o e-mail ${email}`);
  
  // Validação de segurança no backend para garantir que dados essenciais chegaram
  if (!planId || !nome || !email) {
      console.error("Erro: Requisição com dados faltando.", req.body);
      return res.status(400).send({ error: "Dados essenciais (nome, e-mail, plano) estão faltando." });
  }

  const counterRef = db.collection("counters").doc("passports");

  try {
    // Executa a criação do contador e do usuário em uma única transação segura
    const passportId = await db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      const nextId = (counterDoc.exists ? counterDoc.data().count : 0) + 1;
      const newPassportId = String(nextId).padStart(5, '0');

      // Monta o objeto com os dados do novo sócio
      const dadosSocio = {
        createdBy: adminUid, // Guarda quem foi o admin que criou o sócio
        role: "Sócio",
        passportId: newPassportId,
        planId: planId,
        status: "ativo",
        creationDate: admin.firestore.FieldValue.serverTimestamp(),
        financialResponsible_name: nome,
        financialResponsible_cpf: cpf,
        financialResponsible_dob: dob,
        financialResponsible_email: email,
        financialResponsible_phone: telefone,
        financialResponsible_address: endereco,
      };

      // Define os documentos que serão criados/atualizados na transação
      const newUserRef = db.collection("users").doc(newPassportId);
      transaction.set(newUserRef, dadosSocio);
      transaction.update(counterRef, { count: nextId });
      
      return newPassportId; // Retorna o ID do novo passaporte se a transação for bem-sucedida
    });

    console.log(`Sucesso! Passaporte ${passportId} criado.`);
    res.status(200).send({ status: "success", passportId: passportId });

  } catch (error) {
    console.error("Falha na transação de criação de sócio:", error);
    res.status(500).send({ error: "Ocorreu um erro interno ao salvar os dados." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

