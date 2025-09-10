// Versão 2.0 do index.js (Backend com Automação)
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const axios = require("axios"); // Adicionamos o axios para chamadas de API

const app = express();
app.use(cors());
app.use(express.json());

const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Middleware de segurança (continua o mesmo)
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
  res.send("API v2.0 do TudoOkFaltandoFinanceiro está no ar!");
});

// NOVA ROTA: Buscar cliente no Asaas pelo CPF
app.get("/buscarClienteAsaas", checkAuth, async (req, res) => {
    const { cpf } = req.query;
    if (!cpf) {
        return res.status(400).send({ error: "CPF é obrigatório para a busca." });
    }
    try {
        console.log(`Buscando cliente Asaas com CPF: ${cpf}`);
        const response = await axios.get(
            `https://www.asaas.com/api/v3/customers?cpfCnpj=${cpf}`,
            { headers: { access_token: process.env.ASAAS_APIKEY } }
        );

        if (response.data && response.data.data.length > 0) {
            const cliente = response.data.data[0];
            console.log(`Cliente encontrado: ${cliente.id}`);
            res.status(200).send({ asaasCustomerId: cliente.id });
        } else {
            console.log("Nenhum cliente encontrado para este CPF.");
            res.status(404).send({ error: "Cliente não encontrado no Asaas." });
        }
    } catch (error) {
        console.error("Erro ao buscar cliente no Asaas:", error.response ? error.response.data : error.message);
        res.status(500).send({ error: "Falha ao comunicar com a API do Asaas." });
    }
});


// ROTA ATUALIZADA: Criar o sócio, agora com criação de usuário no Auth
app.post("/criarSocio", checkAuth, async (req, res) => {
  const { nome, email, cpf, dob, telefone, endereco, planId, asaasCustomerId } = req.body;
  const adminUid = req.user.uid;
  console.log(`Admin ${adminUid} iniciando criação completa para o e-mail ${email}`);

  if (!planId || !nome || !email || !asaasCustomerId) {
      return res.status(400).send({ error: "Dados essenciais (nome, e-mail, plano, ID Asaas) estão faltando." });
  }

  try {
    // 1. Cria o usuário no Firebase Authentication PRIMEIRO
    const userRecord = await admin.auth().createUser({
        email: email,
        displayName: nome,
        // O usuário é criado sem senha. O admin envia o link de redefinição.
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
        uid: novoSocioUid, // Usa o UID do NOVO SÓCIO
        asaasCustomerId: asaasCustomerId, // Salva o ID do Asaas
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

