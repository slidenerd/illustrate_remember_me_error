import dotenv from "dotenv";
dotenv.config();

import cookieParser from "cookie-parser";
import crypto from "crypto";
import http from "http";
import express from "express";
import passport from "passport";
import expressSession from "express-session";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as RememberMeStrategy } from "passport-remember-me";
import { WebSocketServer } from "ws";
import cors from "cors";
import Redis from "ioredis";

const users = [
  {
    userId: 1,
    email: "abc@example.com",
    password: "123456789",
    isAdmin: false,
  },
  {
    userId: 2,
    email: "xyz@example.com",
    password: "abcdefghi",
    isAdmin: false,
  },
];

const tokens = {};

// Add passport, serialize, deserialize and local strategy with hardcoded email and password
passport.serializeUser((user, done) => {
  console.log("serialize user called", user);
  done(null, user.userId);
});
passport.deserializeUser(async (id, done) => {
  console.log("deserialize user called", id);
  findById(id, function (err, user) {
    done(err, user);
  });
});

function findById(id, fn) {
  const idx = id - 1;
  if (users[idx]) {
    fn(null, users[idx]);
  } else {
    fn(new Error("User " + id + " does not exist"));
  }
}

function findByEmail(email, fn) {
  for (let i = 0, len = users.length; i < len; i++) {
    const user = users[i];
    if (user.email === email) {
      return fn(null, user);
    }
  }
  return fn(null, null);
}

import RedisStore from "connect-redis";
const redisClient = new Redis({
  db: process.env.REDIS_DB,
  host: process.env.REDIS_HOST,
  password: process.env.REDIS_PASSWORD,
  port: process.env.REDIS_PORT,
});

const sessionParser = expressSession({
  name: "test",
  secret: "abracadabra",
  resave: false,
  saveUninitialized: false,
  cookie: {
    sameSite: true,
    secure: false,
    httpOnly: true,
  },
  store: new RedisStore({ client: redisClient }),
});

passport.use(
  new RememberMeStrategy(
    { key: "rememberMe" },
    function (token, done) {
      const userId = tokens[token];
      console.log("consuming token", tokens[token]);
      delete tokens[token];
      findById(userId, function (err, user) {
        if (err) {
          return done(err);
        }
        if (!user) {
          return done(null, false);
        }
        return done(null, user);
      });
    },
    function (user, done) {
      var token = crypto.randomBytes(32).toString("hex");
      tokens[token] = user.userId;
      console.log("issuing token", token, tokens[token]);
      return done(null, token);
    }
  )
);

passport.use(
  "local",
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
      badRequestMessage: "email or password is missing",
    },
    (email, password, done) => {
      findByEmail(email, function (err, user) {
        if (err) {
          return done(err);
        }
        if (!user) {
          return done(null, false, { message: "Unknown user " + email });
        }
        if (user.password !== password) {
          return done(null, false, { message: "Invalid password" });
        }
        return done(null, user);
      });
    }
  )
);

const app = new express();

app.use(cors());
app.use(cookieParser("abracadabra"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(sessionParser);
app.use(passport.initialize());
app.use(passport.session());
app.use(passport.authenticate("remember-me"));
app.use(express.static("public"));

// Retrieve user after login
app.get("/auth/session", (req, res) => {
  return res.json(req.user || false);
});
app.post("/auth/login", (req, res, next) => {
  passport.authenticate("local", {}, async (error, user, info) => {
    if (error) {
      return next(error);
    }
    if (!user) {
      return res.json(false);
    }
    req.logIn(user, (error) => {
      if (error) {
        return next(error);
      }
      console.log(req.session, "session is retrieved here", req.body);
      req.session.color = "blue";
      if (req.body.rememberMe) {
        console.log("setting a remember me cookie");
        res.cookie("remember_me", crypto.randomBytes(32).toString("hex"), {
          path: "/",
          httpOnly: true,
          maxAge: 604800000,
          secure: false,
        });
      }
      return res.json(user);
    });
  })(req, res, next);
});

app.post("/auth/logout", (req, res, next) => {
  req.logout((err) => {
    req.session = null;
    req.user = null;
    res.clearCookie(`test.session`, {});
    res.clearCookie(`test.session.sig`, {});
    return res.json(true);
  });
});

const map = new Map();

const server = http.createServer(app);

const websocketServer = new WebSocketServer({
  noServer: true,
  clientTracking: false,
});

const CHECK_ALIVE_FREQUENCY = 5000;

function checkIfConnectionIsAlive(ws) {
  if (ws.isAlive === false) {
    console.log(new Date(), "ws terminate");
    return ws.terminate();
  }
  ws.isAlive = false;
  ws.ping();
  console.log(new Date(), "ws send ping");
  setTimeout(() => checkIfConnectionIsAlive(ws), CHECK_ALIVE_FREQUENCY);
}

function setUpConnectionStatusTimer(ws) {
  console.log(new Date(), "ws connection monitor active");
  checkIfConnectionIsAlive(ws);
}

function heartbeat() {
  this.isAlive = true;
  console.log(new Date(), "ws recv pong");
}

server.on("upgrade", (request, socket, head) => {
  sessionParser(request, {}, () => {
    console.log("req.user", request.user);
    console.log("req.session", request.session);
    console.log("req.session.user", (request.session || {}).user);
    console.log("req.session.passport", (request.session || {}).passport);
    console.log(
      "req.session.passport.user",
      ((request.session || {}).passport || {}).user
    );

    websocketServer.handleUpgrade(request, socket, head, function (ws) {
      websocketServer.emit("connection", ws, request);
    });
  });
});

websocketServer.on("connection", function (ws, request) {
  const user =
    request.user ||
    (request.session || {}).user ||
    ((request.session || {}).passport || {}).user;

  map.set(user, ws);

  setUpConnectionStatusTimer(ws);

  ws.send(
    "you are logged in as " +
      user +
      " and your color is " +
      (request.session || {}).color
  );
  ws.on("pong", heartbeat);

  ws.on("message", function (message) {
    //
    // Here we can now use session parameters.
    //
    console.log(`Received message ${message} from user ${user}`);
  });

  ws.on("close", function () {
    map.delete(user);
  });
});

server.listen(3000, () => console.log("server listening on 3000"));
