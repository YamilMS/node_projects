// index.js
// where your node app starts

// init project
const express = require('express');

//In order to use the .env file, we need to require it.
require('dotenv').config()

//Validator allow you to check valis url's
const validator = require('validator');

//Middleware to parse incoming request bodies. 
const bodyParser = require('body-parser');

//Multer to upload files
const multer = require('multer');

//to works with files
const fs = require('fs');

//nedb: A lightweight embedded database. We use this to store our original URLs and their associated short codes.
const Datastore = require('nedb');

//db: This initializes a new NeDB database that's saved to the file urls.db. The autoload: true option makes sure the database loads automatically when we start our server.
const db = new Datastore({ filename: 'urls.db', autoload: true });

//check if thefolder uploads exist and if not creates it
const uploadsDir = __dirname + '/uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, './uploads');
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    }
  });
  
const upload = multer({ storage: storage });

// init express app
const app = express();

// enable CORS (https://en.wikipedia.org/wiki/Cross-origin_resource_sharing)
// so that your API is remotely testable by FCC 
const cors = require('cors');
app.use(cors({optionsSuccessStatus: 200}));  // some legacy browsers choke on 204

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));

//tells Express to use body-parser for parsing the body of incoming JSON requests
app.use(bodyParser.urlencoded({ extended: false }));


// http://expressjs.com/en/starter/basic-routing.html
app.get("/", function (req, res) {
  res.sendFile(__dirname + '/views/index.html');
});


// your first API endpoint... 
app.get("/api/hello", function (req, res) {
  res.json({greeting: 'hello API'});
});

//CREATE AND ENDPOINT THAT PROVIDE THE UNIX TIMESTAMP AND UTC STRING FOR A GIVEN DATE STRING
app.get("/api/:date_string?", function(req, res) {
    let dateString = req.params.date_string;

    if (!dateString) {
        // If no date_string is provided, return the current time
        const now = new Date();
        return res.json({unix: now.getTime(), utc: now.toUTCString()});
    }

    // Initialize date either from string or unix timestamp
    let date;
    if (isNaN(dateString)) {
        date = new Date(dateString);
    } else {
        date = new Date(parseInt(dateString));
    }

    if (date.toString() === "Invalid Date") {
        return res.json({ error: "Invalid Date" });
    } else {
        return res.json({ unix: date.getTime(), utc: date.toUTCString() });
    }
});

//CREAT AN ENDPOINT THAT PROVIDE THE IP ADDRESS, LANGUAGE, AND USER AGENT FOR THE REQUEST
app.get("/whoami", (req, res) => {
  res.json({
    ipaddress: req.ip,
    language: req.headers["accept-language"],
    software: req.headers["user-agent"]
  });
})

//This endpoint will return the original URL associated with the short code.
app.post('/api/shorturl', (req, res) => {
  const { url } = req.body;

  // Check if URL is valid through validator
  if (!validator.isURL(url, { require_protocol: true, require_host: true })) {
    return res.json({ error: 'invalid url' });
  }

  // Check if URL exists
  db.findOne({ original: url }, (err, doc) => {
      if (err) {
          return res.json({ error: 'An error has occurred' });
      }
      
      // If URL exists, return the short code
      if (doc) {
          return res.json({ original_url: doc.original, short_url: doc._id });
      }

      // If URL does not exist, insert it into the database and return the short code
      db.insert({ original: url }, (err, newDoc) => {
          if (err) {
              return res.json({ error: 'An error has occurred' });
          }
          return res.json({original_url: newDoc.original, short_url: newDoc._id });
      });
  })
})

//This endpoint will return the original URL associated with the short code.
app.get('/api/shorturl/:id', (req, res) => {
    const { id } = req.params;

    db.findOne({ _id: id }, (err, doc) => {
        if (doc) {
            res.redirect(doc.original);
        } else {
            res.status(404).send('URL not found');
        }
    });
});

//Endpoint to return all users
app.get('/api/users/all', (req, res) => {
    db.find({}, (err, docs) => {
        if (err) {
            return res.json({ error: 'An error has occurred' });
        }
        return res.json(docs);
    })
})

//Endpoint to create a user
app.post('/api/users', (req, res) => {
    const { username } = req.body;

    // Check if username exists if not add the user to the database
    db.findOne({ username }, (err, doc) => {
        if (err) {
        return res.status(400).json({ error: 'An error has occurred' });
        }

        if (doc) {
        return res.status(400).json({ error: 'username already exists' });
        }

        if (!username) {
        return res.status(400).json({ error: 'username is required' });
        }

        // If username does not exist, insert it into the database and return the short code    
        db.insert({ username }, (err, newDoc) => {
            if (err) {
                return res.status(500).json({ error: 'An error occurred while inserting the user' });
            }
            return res.json({ username: newDoc.username, _id: newDoc._id });
        });
    })
  
})

//Endpoint thar return the exercise data and get username of the user by id
app.post('/api/users/:_id/exercises', (req, res) => {
    const { _id } = req.params;
    let { description, duration, date } = req.body;

    date = date ? new Date(date) : new Date();

    db.findOne({ _id }, (err, doc) => {
        if (err) {
            return res.status(400).json({ error: 'An error has occurred' });
        }
        if (!doc) {
            return res.status(400).json({ error: 'User not found' });
        }

        if (!description || !duration) {
            return res.status(400).json({ error: 'Both description and duration are required' });
        }

        // Assuming you have an exercises field in your user document
        db.update({ _id }, { $push: { exercises: { description,
            duration,
            date } } }, {}, (err, numAffected) => {
            if (err) {
                return res.status(500).json({ error: 'An error occurred while inserting the exercise' });
            }

            // Sending back the updated user data
            return res.json(
                {
                    _id,
                    username: doc.username,
                    date: date.toDateString(),
                    duration: parseInt(duration),
                    description
                
                }
            );
        });
    });
});


//Endpoint to return the exercise data of the user by id and filter by date
app.get('/api/users/:_id/logs', (req, res) => {
    const { _id } = req.params;
    const { from, to, limit } = req.query;

    db.findOne({ _id }, (err, doc) => {
        if (err) {
        return res.status(400).json({ error: 'An error has occurred' });
        }

        if (!doc) {
        return res.status(400).json({ error: 'User not found' });
        }

        db.find({_id }, (err, docs) => {
            if (err) {
                return res.status(400).json({ error: 'An error has occurred' });
            }
            
            let exercises = doc.exercises || [];
        

            if (from) {
                exercises = exercises.filter(exercise => {
                    return new Date(exercise.date) >= new Date(from);
                })
            }

            if (to) {
                exercises = exercises.filter(exercise => {
                    return new Date(exercise.date) <= new Date(to);
                })
            }
            
            if (limit) {
                exercises = exercises.slice(0, limit);
            }

            const formattedExercises = exercises.map(exercise => ({
                description: exercise.description,
                duration: parseInt(exercise.duration),
                date: new Date(exercise.date).toDateString(),
              }));

            res.json({
                _id: _id,
                username: doc.username,
                count: formattedExercises.length,
                log: formattedExercises
            })
        })
    })
})

// File upload route
app.post('/api/fileanalyse', upload.single('upfile'), (req, res) => {
  const fileData = {
    name: req.file.originalname,
    type: req.file.mimetype,
    size: req.file.size
  };

  // Insert the file metadata into NeDB
  db.insert(fileData, (err, newDoc) => {
    if (err) return res.status(500).send(err);
    res.json(newDoc);
  });
});

// listen for requests :)
const listener = app.listen(process.env.PORT  || 3000, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
