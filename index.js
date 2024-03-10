const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken');
const nodemailer = require("nodemailer");
const mg = require('nodemailer-mailgun-transport');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
require('dotenv').config()
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 3000;

// Middleware
app.use(cors())
app.use(express.json());

// Email Send
// Nodemailer send grid-----------------
// let transporter = nodemailer.createTransport({
//   host: 'smtp.sendgrid.net',
//   port: 587,
//   auth: {
//     user: "apikey",
//     pass: process.env.SENDGRID_API_KEY
//   }
// })
// -----------------Nodemailer send grid

// Nodemailer mailgun -----------------
const auth = {
  auth: {
    api_key: process.env.EMAIL_PRIVATE,
    domain: process.env.EMAIL_DOMAIN
  }
}

const transporter = nodemailer.createTransport(mg(auth));
// ----------------- Nodemailer mailgun 

const sendPaymentConfirmationEmail = payment => {
  transporter.sendMail({
    from: "nur.subscribe32@gmail.com", // verified sender email
    to: payment.email, // recipient email
    subject: "Bistro Boss || Order Confirmation", // Subject line
    text: "Welcome to Bistro Boss!", // plain text body
    html: `
    <div>
      <h2>Payment Confirmed!!!</h2>
      <p>Transaction id: ${payment.transactionId}</p>
    </div>`, // html body
  }, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });

}

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'Unauthorized access' })
  }
  // bearer token
  const token = authorization.split(' ')[1];
  // console.log('token',token)
  // console.log(process.env.ACCESS_TOKEN_SECRET)
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'Unauthorized access' })
    }
    req.decoded = decoded;
    console.log('decoded', decoded);
    next();
  })
}

// ---------------------------------------------------------------------------------------------------

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.frhdrfe.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("BistroDB").collection("users")
    const menuCollection = client.db("BistroDB").collection("menu")
    const reviewCollection = client.db("BistroDB").collection("reviews")
    const cartCollection = client.db("BistroDB").collection("carts")
    const paymentCollection = client.db("BistroDB").collection("payments")
    const BookingCollection = client.db("BistroDB").collection("bookings")
    const ContactCollection = client.db("BistroDB").collection("contacts")


    app.post('/jwt', (req, res) => {
      const user = req.body;
      console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      console.log('token', token)
      // console.log(process.env.ACCESS_TOKEN_SECRET)
      res.send({ token })
    })

    // Warning: use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await userCollection.findOne(query);
      // const result = {admin: user?.role === 'admin'}
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'Forbidden Message' })
      }
      next();
    }

    /***
     * 
     * 0. Do not show secure links to those who should not see the links
     * 1. use jwt token: verifyJWT
     * 2. use verifyAdmin middleware
     * 
    */

    // Users Related APIs
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: 'User already exists' })
      }
      const result = await userCollection.insertOne(user)
      res.send(result)
    })

    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }
      const query = { email: email }
      const user = await userCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);
    })

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result)
    })
    app.delete('/user/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

    // Menu Related APIs
    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    })

    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: (new ObjectId(id).toString()) };
      const options = {
        projection: { _id: 1, name: 1, recipe: 1, image: 1, category: 1, price: 1 },
      };
      try {
        const result = await menuCollection.findOne(query, options);
        res.send(result);
      } catch (error) {
        console.error('Error retrieving menu item:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.post('/menu', verifyJWT, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      newItem._id = new ObjectId().toHexString();
      const result = await menuCollection.insertOne(newItem);
      res.send(result);
    })

    app.patch('/menu/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: id }
      const updatedMenu = req.body;
      const updateDoc = {
        $set: {
          name: updatedMenu.name,
          recipe: updatedMenu.recipe,
          image: updatedMenu.image,
          category: updatedMenu.category,
          price: updatedMenu.price,
        },
      };
      const result = await menuCollection.updateOne(filter, updateDoc);
      res.send(result);
    })
    app.delete('/menu/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: id }
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    })

    // Review Related APIs
    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    })
    app.post('/reviews', async (req, res) => {
      const newItem = req.body;
      const result = await reviewCollection.insertOne(newItem);
      res.send(result);
    })

    // Booking Related APIs
    app.get('/bookings', async (req, res) => {
      const result = await BookingCollection.find().toArray();
      res.send(result);
    })
    app.post('/bookings', async (req, res) => {
      const newItem = req.body;
      const result = await BookingCollection.insertOne(newItem);
      res.send(result);
    })
    app.get('/booking/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const options = {
        projection: { _id: 1, date: 1, time: 1, guest: 1, name: 1, phone: 1, email: 1, status: 1 },
      };
      try {
        const result = await BookingCollection.findOne(query, options);
        res.send(result);
      } catch (error) {
        console.error('Error retrieving menu item:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });
    app.patch('/booking/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedMenu = req.body;
      const updateDoc = {
        $set: {
          status: updatedMenu.status
        },
      };
      const result = await BookingCollection.updateOne(filter, updateDoc);
      res.send(result)
    })

    // cart Related APIs
    app.get('/carts', verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'Forbidden access' })
      }
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/carts', async (req, res) => {
      const item = req.body;
      // console.log(item);
      const result = await cartCollection.insertOne(item);
      res.send(result);
    })

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await cartCollection.deleteOne(query);
      res.send(result);

    })

    // contact related APIs
    app.get('/contact', async (req, res) => {
      const result = await ContactCollection.find().toArray();
      res.send(result);
    })
    app.post('/contact', async (req, res) => {
      const newItem = req.body;
      const result = await ContactCollection.insertOne(newItem);
      res.send(result);
    })

    // Create Payment Intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card']
        // automatic_payment_methods: {
        //   enabled: true,
        // },
      })
      res.send({
        clientSecret: paymentIntent.client_secret,
      });

    })

    // Payment Related Api
    app.get('/payments', async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    })
    app.post('/payments', verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } }
      const deletedResult = await cartCollection.deleteMany(query);

      // Send an Email confirming email
      console.log('Payments', payment)
      sendPaymentConfirmationEmail(payment)

      res.send({ insertResult, deletedResult });
    })

    app.get('/admin-status', verifyJWT, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const products = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      // Best way to get sum of a field is to use group and sum operator
      // await paymentCollection.aggregate([
      //   {
      //     $group: {
      //       _id: null,
      //       total:{$sum:'$price'}
      //     }
      //   }
      // ]).toArray();

      const payments = await paymentCollection.find().toArray();
      const revenue = payments.reduce((sum, payment) => sum + payment.price, 0)


      res.send({ users, products, orders, revenue })
    })

    app.get('/order-stats', async (req, res) => {
      const pipeline = [
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItems',
            foreignField: '_id',
            as: 'menuItemsData'
          }
        },
        {
          $unwind: '$menuItemsData'
        },
        {
          $group: {
            _id: '$menuItemsData.category',
            count: { $sum: 1 },
            totalPrice: { $sum: '$menuItemsData.price' }
          }
        },
        {
          $project: {
            category: '$_id',
            count: 1,
            total: { $round: ['$totalPrice', 2] },
            _id: 0
          }
        }
      ];

      const result = await paymentCollection.aggregate(pipeline).toArray();
      res.send(result)
    })



    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// -------------------------------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.json('Boss is running')
})

app.listen(port, () => {
  console.log(`Boss is sitting on port ${port}`)
})