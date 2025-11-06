// server.js

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const helmet = require('helmet');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();


console.log("MONGO_URI =", process.env.MONGO_URI); // ✅ debug check
// MongoDB Atlas connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error("MongoDB connection error:", err));

const PORT = process.env.PORT || 3000;
// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-to-a-strong-random-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // Added for JSON parsing

// --- Schemas & Models ---
const feedbackSchema = new mongoose.Schema({ name: String, email: String, rating: Number, feedback: String });
const contactSchema = new mongoose.Schema({ name: String, email: String, phone: String, message: String });
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  banned: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false }
}, { timestamps: true });


const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cart: Array,
  address: String,
  paymentMethod: String,
  totalCost: String,
  totalItems: String,
  status: { type: String, default: 'Pending' }, // ✅ Add this line
  createdAt: { type: Date, default: Date.now },
});

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  price: Number,
  category: String,
  img: String 
});

const Product = mongoose.model('Product', ProductSchema); //
const Order = mongoose.model('Order', orderSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);
const Contact = mongoose.model('Contact', contactSchema);
const User = mongoose.model('User', userSchema);


// --- Static Routes ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/order.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'order.html')));
app.get('/feedback.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'feedback.html')));
app.get('/contact.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'contact.html')));
app.get('/product.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'product.html')));

app.get('/user.html', async (req, res) => {
  if (!req.session.userId) return res.json(null);
  const user = await User.findById(req.session.userId).select('username');
  res.json(user);
});


// --- Routes ---

app.use(express.json());
app.use(helmet()); // helps set security headers

// Submit Order

app.post('/submit-order', async (req, res) => {
  const { cart, address, paymentMethod, totalCost, totalItems } = req.body;
  if (!cart?.length || !address || !paymentMethod) {
    return res.status(400).json({ message: 'Incomplete order data' });
  }
  try {
    const newOrder = new Order({
      userId: req.session.userId || null,
      cart, address, paymentMethod, totalCost, totalItems
    });
    await newOrder.save();
    console.log('🛒 Order saved:', newOrder);
    res.json({ message: 'Order placed successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error saving order' });
  }
});



app.post('/admin/add-product', async (req, res) => {
  try {
    const { name, price, category, imageBase64 } = req.body;

    if (!name || !price || !category || !imageBase64) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const newProduct = new Product({
      name,
      price,
      category,
      img: imageBase64
    });

    await newProduct.save();
    res.json({ message: 'Product added successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error saving product' });
  }
});
  
app.post('/admin/update-order-status', async (req, res) => {
  const { orderId, status } = req.body;

  if (!req.session.isAdmin) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    await Order.findByIdAndUpdate(orderId, { status });
    res.json({ message: 'Order status updated' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update order status' });
  }
});



// Feedback
app.post('/submit-feedback', async (req, res) => {
  const { name, email, rating, feedback } = req.body;
  if (!name || !email || !feedback || !rating) {
    return res.status(400).json({ message: 'All feedback fields are required' });
  }
  try {
    const newFeedback = new Feedback({ name, email, rating, feedback });
    await newFeedback.save();
    res.json({ message: 'Thank you for your feedback!' });
  } catch (err) {
    res.status(500).json({ message: 'Error submitting feedback' });
  }
});

// Contact
app.post('/submit-contact', async (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!name || !email || !phone || !message) {
    return res.status(400).json({ message: 'All contact fields are required' });
  }
  try {
    const newContact = new Contact({ name, email, phone, message });
    await newContact.save();
    res.json({ message: 'Thank you for contacting us!' });
  } catch (err) {
    res.status(500).json({ message: 'Error submitting contact' });
  }
});


app.post('/signup', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password || !email) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  try {
    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) {
      return res.status(409).json({ message: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, email });
    await newUser.save();
    req.session.userId = newUser._id;
    req.session.username = newUser.username;
    res.json({ message: 'Signup successful!', username: newUser.username });
  } catch (err) {
    res.status(500).json({ message: 'Error during signup' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // Bypass for Akshay
  if (username === 'Akshay' && password === 'akshay123') {
    req.session.userId = 'admin-akshay';
    req.session.username = 'Akshay';
    req.session.isAdmin = true;
    return res.json({ message: 'Admin login successful!' });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (match) {
      req.session.userId = user._id;
      req.session.username = user.username;
      res.json({ message: 'Login successful!', username: user.username });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Login error' });
  }
});




// Get current logged-in user
app.get('/me', async (req, res) => {
  if (!req.session.userId) return res.json(null);
  const user = await User.findById(req.session.userId).select('username');
  res.json(user);
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out' }));
});

// Get user's orders
app.get('/user/orders', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Not logged in' });
  try {
    const orders = await Order.find({ userId: req.session.userId }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});


app.get('/admin/orders', async (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ message: 'Unauthorized' });
  }
  try {
    const orders = await Order.find()
      .populate('userId', 'username') 
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});


app.post('/admin/delete-order', async (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ message: 'Unauthorized' });
  }
  try {
    const { orderId } = req.body;
    const result = await Order.deleteOne({ _id: orderId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete order' });
  }
});


// Products API (static example)
// Get all products from DB
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find({});
    res.json(products);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ message: 'Error fetching products' });
  }
});



// Get all orders (for dashboard stats & charts)
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching orders' });
  }
});

// Get all users (for dashboard stats)
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Get all feedbacks (for dashboard stats & avg rating)
app.get('/api/feedbacks', async (req, res) => {
  try {
    const feedbacks = await Feedback.find().sort({ _id: -1 });
    res.json(feedbacks);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching feedbacks' });
  }
});





// DELETE product by name
app.post('/admin/delete-product', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await Product.deleteOne({ name });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: 'Error deleting product' });
  }
});

// UPDATE product by old name
app.post('/admin/update-product', async (req, res) => {
  try {
    const { oldName, name, price, category, imageBase64 } = req.body;

    const update = {
      name,
      price,
      category,
    };

    if (imageBase64) {
      update.img = imageBase64;
    }

    const result = await Product.updateOne({ name: oldName }, { $set: update });

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Product not found for update' });
    }

    res.json({ message: 'Product updated successfully' });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ message: 'Error updating product' });
  }
});


app.get('/admin/feedbacks', async (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ message: 'Unauthorized' });
  }
  try {
    const feedbacks = await Feedback.find().sort({ _id: -1 });
    res.json(feedbacks);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch feedbacks' });
  }
});

app.post('/admin/delete-feedback', async (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ message: 'Unauthorized' });
  }
  try {
    const { feedbackId } = req.body;
    const result = await Feedback.deleteOne({ _id: feedbackId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Feedback not found' });
    }
    res.json({ message: 'Feedback deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete feedback' });
  }
});

// ✅ Get all users (Admin only)
app.get('/admin/users', async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ message: 'Unauthorized' });
  try {
    const users = await User.find({}, 'username email createdAt banned').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// ✅ Ban or Unban a user
app.post('/admin/toggle-ban', async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ message: 'Unauthorized' });
  try {
    const { userId, banned } = req.body;
    await User.findByIdAndUpdate(userId, { banned });
    res.json({ message: banned ? 'User banned successfully' : 'User unbanned successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update user status' });
  }
});

// ✅ Delete a user
app.post('/admin/delete-user', async (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ message: 'Unauthorized' });
  try {
    const { userId } = req.body;
    await User.deleteOne({ _id: userId });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete user' });
  }
});



// Optional route to seed products in MongoDB
app.get('/insert-products', async (req, res) => {
  try {
    const products = [
      { name: "Paracetamol", price: 25, img: "images/paracetamol.jpg" },
      { name: "Cough Syrup", price: 60, img: "images/syrup.jpg" },
      { name: "Vitamin C Tablets", price: 120, img: "images/vitamin-c.jpg" }
    ];
    for (const p of products) {
      await Product.updateOne({ name: p.name }, { $set: p }, { upsert: true });
    }
    res.send('Sample products inserted/updated successfully');
  } catch (error) {
    console.error('Error inserting products:', error);
    res.status(500).send('Error inserting products. Please try again later.');
  }
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
});
