// Versão 3.0 do index.js (Backend com Busca Asaas integrada)
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Middleware de segurança (não modificado)
const checkAuth = async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    const idToken = req.headers.authorization.split('Bearer ')[1];
    try {
      req.user = await admin.auth().verifyIdToken(idToken);
      next();
    } catch (error) {
      console.error("Token inválido:", error);
      res.status(401).send({ error: "Autenticação inválida." });
    }
  } else {
    res.status(401).send({ error: "Credencial de autenticação não encontrada." });
  }
};

app.get("/", (req, res) => {
  res.send("API v3.0 do TudoOkFaltandoFinanceiro está no ar!");
});

// Rota para criar o sócio, agora com a busca do Asaas integrada
app.post("/criarSocio", checkAuth, async (req, res) => {
  const { nome, email, cpf, dob, telefone, endereco, planId } = req.body;
  const adminUid = req.user.uid;
  console.log(`Admin ${adminUid} iniciando criação para ${email}`);

  if (!planId || !nome || !email) {
      return res.status(400).send({ error: "Dados essenciais (nome, e-mail, plano) estão faltando." });
  }

  // --- Início da Integração Asaas ---
  let asaasCustomerId = null; // Começa como nulo por padrão
  const cleanCpf = cpf.replace(/\D/g, ''); // Garante que o CPF não tenha máscara

  if (cleanCpf) {
      try {
          console.log(`Buscando cliente Asaas com CPF: ${cleanCpf}`);
          const response = await axios.get(
              `https://www.asaas.com/api/v3/customers?cpfCnpj=${cleanCpf}`,
              { headers: { access_token: process.env.ASAAS_APIKEY } }
          );

          if (response.data && response.data.data.length > 0) {
              asaasCustomerId = response.data.data[0].id;
              console.log(`Cliente Asaas encontrado: ${asaasCustomerId}`);
          } else {
              console.log("Nenhum cliente Asaas encontrado para este CPF. O campo ficará em branco.");
          }
      } catch (error) {
          // Se der erro na API do Asaas, apenas registramos o erro e continuamos, sem parar a criação
          console.error("Aviso: Falha ao comunicar com a API do Asaas. O campo asaasCustomerId ficará em branco. Erro:", error.response ? error.response.data : error.message);
      }
  }
  // --- Fim da Integração Asaas ---

  try {
    // 1. Cria o usuário no Firebase Authentication
    const userRecord = await admin.auth().createUser({
        email: email,
        displayName: nome,
    });
    const novoSocioUid = userRecord.uid;
    console.log(`Usuário criado no Authentication com UID: ${novoSocioUid}`);

    // 2. Executa a transação para criar o documento no Firestore e atualizar o contador
    const counterRef = db.collection("counters").doc("passports");
    const passportId = await db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      const nextId = (counterDoc.exists ? counterDoc.data().count : 0) + 1;
      const newPassportId = String(nextId).padStart(5, '0');

      const dadosSocio = {
        uid: novoSocioUid,
        asaasCustomerId: asaasCustomerId, // Salva o ID do Asaas (ou null se não encontrou)
        createdBy: adminUid,
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

      const newUserRef = db.collection("users").doc(newPassportId);
      transaction.set(newUserRef, dadosSocio);
      transaction.update(counterRef, { count: nextId });
      
      return newPassportId;
    });

    console.log(`Sucesso! Passaporte ${passportId} e documento de usuário criados.`);
    res.status(200).send({ status: "success", passportId: passportId });

  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
        console.error("Tentativa de criar usuário com e-mail duplicado:", email);
        return res.status(409).send({ error: "Este e-mail já está cadastrado no sistema." });
    }
    console.error("Falha na criação completa do sócio:", error);
    res.status(500).send({ error: "Ocorreu um erro interno ao criar o sócio." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

