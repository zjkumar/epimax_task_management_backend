const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const cors = require('cors')
const app = express();
const port = process.env.port || 5000;

const jwt = require('jsonwebtoken');

// Generate a secure random key of 32 bytes (256 bits)
const key = crypto.randomBytes(32);

// Convert the key to a Base64-encoded string
// const secretKey = key.toString('base64');

const secretKey = 'a_4_Acquire'


// Middleware to parse JSON bodies
app.use(bodyParser.json());

// using cors
// app.use(cors())

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS, DELETE, POST, GET, PATCH, PUT");
  // res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Headers", "Access-Control-Allow-Headers, Origin, Authorization, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers");
  next();
})

// Create MySQL connection pool
const pool = mysql.createPool({

    host: 'aiven-java-mysql-workshop-kumar-d59f.a.aivencloud.com',
    user: 'avnadmin',
    password: 'AVNS_nZOoqcmVXXLtttrfP7V',
    database: 'epimax_task_management',
    port: 25928,
    waitForConnections: true, // Whether the pool should queue connections when all connections are in use
  queueLimit: 0, // Maximum number of connection requests the pool will queue before returning an error
  connectTimeout: 60000, // The maximum number of milliseconds before a timeout occurs during the connection phase
  
});

// const createTableQuery = `
//   CREATE TABLE IF NOT EXISTS users (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     full_name VARCHAR(255) NOT NULL,
//     username VARCHAR(255) NOT NULL UNIQUE,
//     connected_with VARCHAR(255)
//   )
// `;

// // Execute the query to create the table
// pool.query(createTableQuery, (err, results, fields) => {
//   if (err) {
//     console.error('Error creating table: ' + err.message);
//     return;
//   }
//   console.log('Table created successfully');
// });


// middleware to extract user ID from JWT token
const getUserIdFromToken = (request, response, next) => {
    let jwt_token;
    
  const authHeader = request.headers['authorization'];
//   console.log(request.headers, 'these are request.headers')
//   console.log(authHeader)
  if (authHeader !== undefined) {
    jwt_token = authHeader.split(" ")[1];
    // console.log(jwt_token)
  }

    console.log(jwt_token, 'this is jwt token from client')
  

  if (jwt_token === undefined) {
    // console.log("jwt_token is not valid, consoling here")
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwt_token, secretKey, async (error, payload) => {
      if (error) {
        console.log(error)
        console.log('error occured when verifying the jwt token')
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        // for (let i=0; i<30; i++){
        //     console.log(payload.userId, 'this is payload userId')
        // }
        request.userId = payload.userId;
        next();
      }
    });
  }
}

//Route to create a new user
app.post('/create-user', (req, res) => {
    
    const {fullname, username} = req.body;
    
    // Check if the username is unique
    pool.query('SELECT * FROM users WHERE username = ?', [username], (error, results, fields) => {
        if (error) {
            console.error('Error checking username uniqueness:', error);
            res.status(500).json({error: 'Failed to check username uniqueness'});
            return;
        }

        if (results.length > 0) {
            // Username already exists
            res.status(400).json({error: 'Username must be unique'});
            return;
        }

        // Username is unique, proceed with user creation
        // Inserting new user into 'users' table
        pool.query('INSERT INTO users (full_name, username) VALUES(?, ?)', [fullname, username], (error, results, fields) => {
            if (error) {
                console.error('Error creating user:', error);
                res.status(500).json({error: 'Failed to create user'});
                return;
            }
            
            // Creating new tables for the user
            const userId = results.insertId;
            createTables(userId, (err) => {
                if (err) {
                    console.error('Error creating tables:', err);
                    res.status(500).json({error: 'Failed to create tables'});
                    return;
                }
                
                // Generate JWT token
                const token = jwt.sign({ userId }, secretKey, { expiresIn: "30d" }); // Adjust expiration time as needed
                
                // Send token as response
                res.json({ success: true, token, username });
            });
        });
    });
});


function createTables(userId, callback) {
    const sectionsTable = `sections_${userId}`;
    const tasksTable = `tasks_${userId}`;
    const myTasksTable = `mytasks_${userId}`;

    // Creating sections table
    const createSectionsTableQuery = `CREATE TABLE ${sectionsTable} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        section_name TEXT
    )`;

    // Creating tasks table
    const createTasksTableQuery = `CREATE TABLE ${tasksTable} (
        task_id INT AUTO_INCREMENT PRIMARY KEY,
        section_id INT,
        task_name TEXT,
        assignee VARCHAR(255),
        priority VARCHAR(255),
        FOREIGN KEY (section_id) REFERENCES ${sectionsTable}(id)
    )`;

    // Creating myTasks table
    const createMyTasksTableQuery = `CREATE TABLE ${myTasksTable} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        task_id INT,
        FOREIGN KEY (task_id) REFERENCES ${tasksTable}(task_id)
    )`;

    // Inserting initial data into sections table
    const insertSectionsDataQuery = `INSERT INTO ${sectionsTable} (section_name) VALUES ?`;
    const sectionsData = [
        ['To Do'],
        ['Doing'],
        ['Done']
    ];

    // Executing queries to create tables and insert initial data
    pool.query(createSectionsTableQuery, (err1, results1) => {
        if (err1) {
            callback(err1);
            return;
        }
        pool.query(createTasksTableQuery, (err2, results2) => {
            if (err2) {
                callback(err2);
                return;
            }
            pool.query(createMyTasksTableQuery, (err3, results3) => {
                if (err3) {
                    callback(err3);
                    return;
                }
                pool.query(insertSectionsDataQuery, [sectionsData], (err4, results4) => {
                    if (err4) {
                        callback(err4);
                        return;
                    }
                    callback(null); // Tables created and data inserted successfully
                });
            });
        });
    });
}

// Route to modify the section name
app.post('/modifySection', getUserIdFromToken, async (req, res) => {
    const {userId} = req
    const {section_id, userInput} = req.body

    console.log({ section_id, userInput, userId })

    const updateQuery = `
        UPDATE sections_${userId}
        SET section_name = ?
        WHERE id = ?`;

    pool.query(updateQuery, [userInput, section_id], (error, results, fields) => {
        if (error) {
            console.error('Error updating section:', error);
            res.status(500).json({ error: 'Failed to update section name' });
            return;
        }

        console.log('Section Name Updated successfully');
        res.json({ success: true });
    });

})


// Route to create a new section

app.post('/createNewSection', getUserIdFromToken, async(req, res) => {
    const {userId} = req
    const {userInput} = req.body

    const insertSectionQuery = `INSERT INTO sections_${userId} (section_name) VALUES (?)`;
    pool.query(insertSectionQuery, [userInput], (error, result) => {
        if (error) {
            console.error('Error creating section:', error);
            res.status(500).json({ error: 'Failed to create section' });
            return;
        }

        console.log('Section created successfully');
        res.json({ success: true });
    });

})


// Route to delete a section

app.delete('/deleteSection', getUserIdFromToken, async(req, res) => {
    const {userId} = req
    
    const section_id = req.headers["section_id"];

    console.log({ section_id, userId })

    const deleteMyTasksQuery = `
        DELETE FROM mytasks_${userId} 
        WHERE task_id IN (SELECT task_id FROM tasks_${userId} WHERE section_id = ?)`;


    pool.query(deleteMyTasksQuery, [section_id], (error, myTaskResult) => {
        if (error) {
            console.error('Error deleting my tasks:', error);
            res.status(500).json({ error: 'Failed to delete section and tasks' });
            return;
        }

        // Delete tasks related to the section from tasks_${userId} table
        const deleteTasksQuery = `DELETE FROM tasks_${userId} WHERE section_id = ?`;
        pool.query(deleteTasksQuery, [section_id], (error, taskResult) => {
            if (error) {
                console.error('Error deleting tasks:', error);
                res.status(500).json({ error: 'Failed to delete section and tasks' });
                return;
            }

            // Delete the section from sections_${userId} table
            const deleteSectionQuery = `DELETE FROM sections_${userId} WHERE id = ?`;
            pool.query(deleteSectionQuery, [section_id], (error, sectionResult) => {
                if (error) {
                    console.error('Error deleting section:', error);
                    res.status(500).json({ error: 'Failed to delete section and tasks' });
                    return;
                }

                console.log('Section and related tasks deleted successfully');
                res.json({ success: true });
            });
        });
    });
})

//Route to update a task
app.post('/updateTask', getUserIdFromToken, async (req, res) => {

    const {userId} = req
    
    const { task_id, section_id, columnName, userInput } = req.body;

    console.log({ task_id, section_id, columnName, userInput, userId })
    
    // Validate assignee if the column to be updated is 'assignee'
    if (columnName === 'assignee') {
        const assigneeQuery = 'SELECT id FROM users WHERE username = ?';
        try {
            const assigneeRows =   pool.query(assigneeQuery, [userInput]);
            if (assigneeRows.length === 0) {
                res.status(400).json({ error: 'Assignee not found' });
                return;
            }
        } catch (error) {
            console.error('Error checking assignee:', error);
            res.status(500).json({ error: 'Failed to update task' });
            return;
        }
    }

    // Construct the update query dynamically based on the column name and user input
    const updateQuery = `
        UPDATE tasks_${userId}
        SET ${columnName} = ?
        WHERE task_id = ? AND section_id = ?`;

    // Execute the update query with user input, task ID, and section ID
    pool.query(updateQuery, [userInput, task_id, section_id], (error, results, fields) => {
        if (error) {
            console.error('Error updating task:', error);
            res.status(500).json({ error: 'Failed to update task' });
            return;
        }

        console.log('Task updated successfully');
        res.json({ success: true });
    });
});





// Route to login the user
app.post('/login',  (req, res) => {
    
    const {username} = req.body;
   
     pool.query(`SELECT * FROM users WHERE username = '${username}'`, (error, results, fields) => {
        if (error) {
            console.error('Error finding user:', error);
            res.status(500).json({error: 'Failed to find user'});
            return;
        }
        if (results.length === 0){
            res.status(400).json({error: 'User not found'});
            return; 
        }
        const userId = results[0].id;
        const jwt_token = jwt.sign({ userId }, secretKey, { expiresIn: "30d" }); // Adjust expiration time as needed
        
        res.json({success: true, jwt_token, username})
    })
})




app.get('/', getUserIdFromToken, (req, res) => {
    // Get the user ID from the request (assuming it's included in the JWT token)
    const userId = req.userId; // Implement this function to extract user ID from JWT token

    // Query to fetch sections and their related tasks for the current user
    const sectionsQuery = `
        SELECT s.id AS section_id, s.section_name, t.task_id, t.task_name, t.assignee, t.priority
        FROM sections_${userId} AS s
        LEFT JOIN tasks_${userId} AS t ON s.id = t.section_id
        ORDER BY s.id, t.task_id`;

    // Execute the query
    pool.query(sectionsQuery, (error, results, fields) => {
        if (error) {
            console.error('Error fetching sections:', error);
            res.status(500).json({error: 'Failed to fetch sections'});
            return;
        }

        // Process the results to organize sections and tasks
        const sections = {};
        results.forEach(row => {
            const { section_id, section_name, task_id, task_name, assignee, priority } = row;
            if (!sections[section_id]) {
                sections[section_id] = { section_id,  section_name, tasks: [] };
            }
            if (task_id) {
                sections[section_id].tasks.push({ task_id, task_name, assignee, priority });
            }
        });

        // Convert sections object to an array
        const sectionsArray = Object.values(sections);

        // Send the sections and tasks as response
        res.json({ sections: sectionsArray });
    });
});


app.post('/save-task', getUserIdFromToken, (req, res) => {
    const {userId} = req

    if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const { section_id, task, priority, assignee } = req.body;

    // Inserting task into tasks_${userId} table
    const taskInsertQuery = `
        INSERT INTO tasks_${userId} (section_id, task_name, assignee, priority) 
        VALUES (?, ?, ?, ?)`;

    pool.query(taskInsertQuery, [section_id, task, assignee, priority], (error, results, fields) => {
        if (error) {
            console.error('Error saving task:', error);
            res.status(500).json({ error: 'Failed to save task' });
            return;
        }

        const taskId = results.insertId;

        // If assignee is provided, insert task into mytasks_${assignee} table
        if (assignee) {
            const assigneeIdQuery = `SELECT id FROM users WHERE username = ?`;
            pool.query(assigneeIdQuery, [assignee], (error, results, fields) => {
                if (error) {
                    console.error('Error finding assignee:', error);
                    res.status(500).json({ error: 'Failed to find assignee' });
                    return;
                }

                if (results.length === 0) {
                    res.status(400).json({ error: 'Assignee not found' });
                    return;
                }

                const assigneeId = results[0].id;
                const myTasksInsertQuery = `INSERT INTO mytasks_${assigneeId} (task_id) VALUES (?)`;
                pool.query(myTasksInsertQuery, [taskId], (error, results, fields) => {
                    if (error) {
                        console.error('Error saving task for assignee:', error);
                        res.status(500).json({ error: 'Failed to save task for assignee' });
                        return;
                    }
                    res.json({ success: true });
                });
            });
        } else {
            res.json({ success: true });
        }
    });
});



// Start the server
app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});
