// Versão 04 do index.js (Backend)
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// Inicializa o Firebase Admin a partir da variável de ambiente
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Middleware de segurança para verificar a autenticação do usuário
const checkAuth = async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    const idToken = req.headers.authorization.split('Bearer ')[1];
    try {
      req.user = await admin.auth().verifyIdToken(idToken);
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
  res.send("API v04 do TudoOkFaltandoFinanceiro está no ar!");
});

// Rota para obter as faturas do Asaas do usuário logado
app.get("/getAsaasBills", checkAuth, async (req, res) => {
    const uid = req.user.uid;
    console.log(`Buscando faturas Asaas para o UID: ${uid}`);
    try {
        const userQuery = await db.collection("users").where("uid", "==", uid).limit(1).get();
        if (userQuery.empty) {
            return res.status(404).send({ error: "Registro de usuário não encontrado." });
        }
        
        const asaasCustomerId = userQuery.docs[0].data().asaasCustomerId;
        if (!asaasCustomerId) {
            return res.status(200).send([]); // Retorna lista vazia se não tiver ID, não é um erro
        }

        const asaasApiKey = process.env.ASAAS_APIKEY;
        if (!asaasApiKey) {
            return res.status(500).send({ error: "Erro de configuração no servidor (Asaas)." });
        }

        const response = await axios.get(
            `https://www.asaas.com/api/v3/payments?customer=${asaasCustomerId}`,
            { headers: { access_token: asaasApiKey } }
        );

        const bills = response.data.data.map(bill => ({
            dueDate: bill.dueDate,
            value: bill.value,
            status: bill.status === "CONFIRMED" || bill.status === "RECEIVED" ? "paga" : (bill.status === "OVERDUE" ? "vencida" : "pendente"),
            paymentLink: bill.invoiceUrl,
        }));
        res.status(200).send(bills);
    } catch (error) {
        console.error("Erro ao buscar faturas Asaas:", error.message);
        res.status(500).send({ error: "Falha ao buscar dados financeiros." });
    }
});

// Rota para criar um novo sócio
app.post("/criarSocio", checkAuth, async (req, res) => {
  const { nome, email, cpf, dob, telefone, endereco, planId } = req.body;
  const adminUid = req.user.uid;

  if (!planId || !nome || !email || !cpf) {
      return res.status(400).send({ error: "Dados essenciais (nome, e-mail, CPF, plano) estão faltando." });
  }

  let asaasCustomerId = null;
  const cleanCpf = cpf.replace(/\D/g, '');

  if (cleanCpf && process.env.ASAAS_APIKEY) {
      try {
          const response = await axios.get(
              `https://www.asaas.com/api/v3/customers?cpfCnpj=${cleanCpf}`,
              { headers: { access_token: process.env.ASAAS_APIKEY } }
          );
          if (response.data?.data?.length > 0) {
              asaasCustomerId = response.data.data[0].id;
          }
      } catch (error) {
          console.error("Aviso: Falha ao comunicar com a API do Asaas:", error.message);
      }
  }

  try {
    const userRecord = await admin.auth().createUser({ email, displayName: nome });
    const novoSocioUid = userRecord.uid;

    const counterRef = db.collection("counters").doc("passports");
    const passportId = await db.runTransaction(async (t) => {
      const counterDoc = await t.get(counterRef);
      const nextId = (counterDoc.exists ? counterDoc.data().count : 0) + 1;
      const newPassportId = String(nextId).padStart(5, '0');
      const newUserRef = db.collection("users").doc(newPassportId);

      t.set(newUserRef, {
        uid: novoSocioUid,
        asaasCustomerId,
        createdBy: adminUid,
        role: "Sócio",
        passportId: newPassportId,
        planId, status: "ativo",
        creationDate: admin.firestore.FieldValue.serverTimestamp(),
        financialResponsible_name: nome,
        financialResponsible_cpf: cpf,
        financialResponsible_dob: dob,
        financialResponsible_email: email,
        financialResponsible_phone: telefone,
        financialResponsible_address: endereco,
      });
      t.update(counterRef, { count: nextId });
      return newPassportId;
    });

    res.status(200).send({ status: "success", passportId });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
        return res.status(409).send({ error: "Este e-mail já está cadastrado no sistema." });
    }
    console.error("Falha na criação do sócio:", error);
    res.status(500).send({ error: "Ocorreu um erro interno ao criar o sócio." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});



