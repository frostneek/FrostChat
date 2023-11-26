const io = require('socket.io-client');
const chalk = require('chalk').constructor({ enabled: true, level: 3 });
const readline = require('readline');
const fs = require('fs');
const Filter = require('bad-words');

const socket = io("https://frostchat-main-server.frostneek.repl.co");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const userDataFile = 'jsons/users.json'; // File to store user data
const onlineUsers = new Set(); // Track online users
const mutedUsers = new Map();
const bannedUsers = new Set(); // Track banned users

let validUsers = loadUserData();

const roles = ["User", "Trial", "Moderator", "Admin", "Head", "Co-owner", "Owner"];

var id = "";
var buffer = "";
var isLoggedIn = false;

// Initialize the filter
const filter = new Filter();

function chat() {
  rl.question(chalk.blue("» "), (answer) => {
    if (isLoggedIn) {
      if (answer.startsWith('/')) {
        processCommand(answer);
      } else {
        handleChatMessage(answer);
      }
    } else {
      console.log(chalk.red("You need to log in first."));
      login();
    }
  });
}
function handleChatMessage(message) {
  const userRole = getUserRole(id);
  const filteredMessage = filter.clean(message);

  buffer = `${userRole} ${chalk.white(id)} : ${chalk.bgWhite(filteredMessage)}`;

  // Clear the last line from the console
  process.stdout.moveCursor(0, -1);
  process.stdout.clearLine();

  console.log(`${chalk.white('You')} : ${chalk.bgWhite(filteredMessage)}`);  // Display the user's own message on their screen

  // Check if the filtered message is different from the original message
  if (filteredMessage !== message) {
    saveProfanityReport(message);
  }

  socket.emit("message", buffer);
  chat();
}
function saveProfanityReport(originalMessage) {
  const currentTime = new Date();
  const formattedDateTime = `${currentTime.toISOString()} - ${currentTime.toLocaleTimeString()}`;

  const reportMessage = `User ${id} sent a message on ${formattedDateTime}: ${originalMessage}\n`;

  fs.appendFile('logs/profanity-reports.txt', reportMessage, (err) => {
    if (err) {
      console.error('Error saving profanity report:', err);
    } else {
      console.log('Profanity report saved.');
    }
  });
}

function processCommand(command) {
  const [cmd, ...args] = command.slice(1).split(' ');

  switch (cmd.toLowerCase()) {
    case 'help':
    case '?':
      displayHelp();
      break;
    case 'clear':
        handleClear();
      break;
    case 'logout':
      handleLogout();
      break;

    case 'kick':
      if (isAuthorized(id, 'Admin')) {
        handleKick(args[0]);
      } else {
        console.log(chalk.red("You don't have permission to use this command."));
        chat();
      }
      break;

    case 'list':
    case 'online':
      displayOnlineUsers();
      break;

    case 'whisper':
    case 'w':
    case 'msg':
      handleWhisper(args[0], args.slice(1).join(' '));
      break;

    case 'promote':
      if (isAuthorized(id, 'Admin')) {
        handlePromote(args[0], args[1]);
      } else {
        console.log(chalk.red("You don't have permission to use this command."));
        chat();
      }
      break;
    case 'demote':
      if (isAuthorized(id, 'Admin')) {
        handleDemote(args[0], args[1]);
      } else {
        console.log(chalk.red("You don't have permission to use this command."));
        chat();
      }
      break;
    case 'report':
      handleReport(args[0], args.slice(1).join(' '));
      break;
    case 'mute':
      handleMute(args[0], parseInt(args[1], 10));
      break;
    case 'unmute':
      unmuteUser(args[0], parseInt(args[1], 10));
      break;
    case 'delacc':
      if (isAuthorized(id, 'Admin')) {
        handleDeleteAccount(args[0]);
      } else {
        console.log(chalk.red("You don't have permission to use this command."));
        chat();
      }
      break;
    case 'newacc':
      if (isAuthorized(id, 'Admin')) {
        handleNewAccount(args[0], args[1]); // Assuming args[0] is the username and args[1] is the password
      } else {
        console.log(chalk.red("You don't have permission to use this command."));
        chat();
      }
      break;
    default:
      console.log(`${chalk.blue(command)} is not defined. Type /help for a list of commands.`);
      chat();
      break;
  }
}
function handleNewAccount(username, password, role) {
  const userIndex = validUsers.findIndex(user => user.username === username);

  if (userIndex === -1) {
    const validRoles = ["User", "Trial", "Moderator", "Admin", "Head", "Co-owner", "Owner"];
    const selectedRole = validRoles.includes(role.toUpperCase()) ? role.toUpperCase() : "User";

    const newUser = { username, password, role: selectedRole };
    validUsers.push(newUser);

    saveUserData(validUsers, (err) => {
      if (err) {
        console.error(chalk.red('Error writing to user data file:', err));
        // Handle the error as needed
      } else {
        console.log(chalk.green(`User ${chalk.white(username)} has been created successfully with role ${chalk.yellow(selectedRole)}.`));

        // Additional actions if needed, e.g., notify other users or log the event
      }
      chat();
    });
  } else {
    console.log(chalk.red(`Username ${chalk.white(username)} already exists. Choose a different username.`));
    chat();
  }
}
function handleDeleteAccount(username) {
  const userIndex = validUsers.findIndex(user => user.username === username);

  if (userIndex !== -1) {
    // Remove the user from the validUsers array
    const deletedUser = validUsers.splice(userIndex, 1)[0];
    saveUserData(validUsers, (err) => {
      if (err) {
        console.error(chalk.red('Error writing to user data file:', err));
        // Handle the error as needed
      } else {
        console.log(chalk.green(`User ${chalk.white(username)} has been deleted successfully.`));

        // Additional actions if needed, e.g., notify other users or log the event
      }
      chat();
    });
  } else {
    console.log(chalk.red(`User ${chalk.white(username)} not found.`));
    chat();
  }
}
function isAuthorized(username, requiredRole) {
  const user = validUsers.find(user => user.username === username);
  return user && roles.indexOf(user.role) >= roles.indexOf(requiredRole);
}
function loadUserDataFromJson(username) {
  try {
    const data = fs.readFileSync(userDataFile, 'utf8');
    const users = JSON.parse(data);
    return users.find(user => user.username === username);
  } catch (error) {
    console.log(chalk.red("Error loading user data from JSON file: "), error);
    return null;
  }
}
function handleKick(username) {
  if (isAuthorized(id, 'Moderator')) {
    if (id !== username) { // Check if the user is not kicking themselves
      const targetUser = loadUserDataFromJson(username);

      if (targetUser) {
        // Kick the user by disconnecting their socket
        const targetSocket = Object.entries(socket.connected).find(([socketId, user]) => user === username);
        if (targetSocket) {
          const [socketId] = targetSocket;
          socket.sockets.sockets[socketId].disconnect(true);
        }

        console.log(chalk.green(`User ${chalk.white(username)} has been kicked.`));
        logEvent(`${id} kicked ${username}`);
      } else {
        console.log(chalk.red(`Error: User ${chalk.white(username)} not found.`));
      }
    } else {
      console.log(chalk.red("You cannot kick yourself."));
    }
  } else {
    console.log(chalk.red("You don't have permission to use this command."));
  }

  chat();
}
function handleMute(username, duration) {
  if (isAuthorized(id, 'Moderator')) {
    const targetUser = loadUserDataFromJson(username);

    if (targetUser) {
      const targetSocket = Object.entries(socket.connected).find(([socketId, user]) => user === username);

      if (id !== username) { // Check if the user is not muting themselves
        if (targetSocket) {
          const [socketId] = targetSocket;

          mutedUsers.set(username, Date.now() + duration * 1000);

          // Mute the user by sending a mute event to their socket
          socket.sockets.sockets[socketId].emit('mute', {
            duration: duration
          });

          console.log(chalk.green(`User ${chalk.white(username)} has been muted for ${duration} seconds.`));

          // Schedule an unmute event after the specified duration
          setTimeout(() => {
            unmuteUser(username);
          }, duration * 1000);

          // Log the mute event
          logEvent("mutes", `${id} muted ${username} for ${duration} seconds`);
        } else {
          console.log(chalk.red(`Error: Socket not found for user ${chalk.white(username)}.`));
          // Optionally log an error message or take other appropriate action
        }
      } else {
        console.log(chalk.red("You cannot mute yourself."));
      }
    } else {
      console.log(chalk.red(`User ${chalk.white(username)} not found.`));
    }
  } else {
    console.log(chalk.red("You don't have permission to use this command."));
  }

  chat();
}
function unmuteUser(username) {
  if (isAuthorized(id, 'Moderator')) {
    const targetUser = loadUserDataFromJson(username);

    if (targetUser) {
      if (mutedUsers.has(username)) {
        mutedUsers.delete(username);
        console.log(chalk.green(`User ${chalk.white(username)} has been unmuted.`));
      } else {
        console.log(chalk.red(`User ${chalk.white(username)} is not currently muted.`));
      }
    } else {
      console.log(chalk.red(`User ${chalk.white(username)} not found.`));
    }
  } else {
    console.log(chalk.red("You don't have permission to use this command."));
  }

  chat();
}
function displayOnlineUsers() {
  const onlineUsersWithRoles = Object.keys(socket.connected).map(username => {
    const user = validUsers.find(u => u.username === username);
    return { username, role: user ? user.role : 'User' };
  });

  console.log(chalk.green("Online Users:"));
  onlineUsersWithRoles.forEach(user => console.log(chalk.yellow(`${user.username} - ${user.role}`)));
  chat();
}
function handleWhisper(targetUsername, message) {
  if (isAuthorized(id, 'User')) { // Assuming all users can use /whisper
    const targetUser = validUsers.find(user => user.username === targetUsername);

    if (targetUser) {
      const targetSocket = Object.entries(socket.connected).find(([socketId, user]) => user === targetUsername);

      if (targetSocket) {
        const [socketId] = targetSocket;

        // Send the whisper message to the target user
        socket.sockets.sockets[socketId].emit('whisper', {
          from: id,
          message: message
        });

        // Log the whisper
        logEvent(`${id} whispered to ${targetUsername}: ${message}`);
      } else {
        console.log(chalk.red(`Error: Socket not found for user ${chalk.white(targetUsername)}.`));
        // Optionally log an error message or take other appropriate action
      }
    } else {
      console.log(chalk.red(`User ${chalk.white(targetUsername)} not found.`));
    }
  } else {
    console.log(chalk.red("You don't have permission to use this command."));
  }

  chat();
}
function handlePromote(username, newRole) {
  if (roles.includes(newRole)) {
    const targetUser = validUsers.find(user => user.username === username);
    if (targetUser) {
      if (id !== username) { // Check if the user is not promoting themselves
        const oldRole = targetUser.role;
        targetUser.role = newRole;
        saveUserData(validUsers);

        // Broadcast updated user list to all connected clients
        const updatedUserList = validUsers.map(user => ({ username: user.username, role: user.role }));
        socket.emit("updateUsers", updatedUserList);

        // Log the promotion
        logEvent("promotion",`${id} promoted ${username} from ${oldRole} to ${newRole}`);

        console.log(chalk.green(`User ${chalk.white(username)} has been promoted to ${chalk.yellow(newRole)}.`));
      } else {
        console.log(chalk.red("You cannot promote yourself."));
      }
    } else {
      console.log(chalk.red(`User ${chalk.white(username)} not found.`));
    }
  } else {
    console.log(chalk.red(`Invalid role. Available roles: ${chalk.yellow(roles.join(', '))}.`));
  }
  chat();
}
function handleDemote(username, newRole) {
  if (roles.includes(newRole)) {
    const targetUser = validUsers.find(user => user.username === username);
    if (targetUser) {
      if (id !== username) { // Check if the user is not demoting themselves
        const oldRole = targetUser.role;
        targetUser.role = newRole;
        saveUserData(validUsers);

        // Broadcast updated user list to all connected clients
        const updatedUserList = validUsers.map(user => ({ username: user.username, role: user.role }));
        socket.emit("updateUsers", updatedUserList);

        // Log the demotion
        logEvent("demotion",`${id} demoted ${username} from ${oldRole} to ${newRole}`);

        console.log(chalk.green(`User ${chalk.white(username)} has been demoted to ${chalk.yellow(newRole)}.`));
      } else {
        console.log(chalk.red("You cannot demote yourself."));
      }
    } else {
      console.log(chalk.red(`User ${chalk.white(username)} not found.`));
    }
  } else {
    console.log(chalk.red(`Invalid role. Available roles: ${chalk.yellow(roles.join(', '))}.`));
  }
  chat();
}
function logEvent(event, message) {
    if(event.toLowerCase() === "promotion" || "demotion") {
      const logFileName = 'logs/promotions-demotions.txt';
      const timestamp = new Date().toISOString();
      const logEntry = `${timestamp} - ${message}\n`;

      fs.appendFile(logFileName, logEntry, (err) => {
        if (err) {
          console.error(chalk.red('Error writing to logs file:', err));
        }
      });
    }
}
function displayHelp() {
  console.log(chalk.green("Available Commands:"));
  console.log(chalk.yellow("/help - Display this help message"));
  console.log(chalk.yellow("/logout - Log out of the chat"));
  console.log(chalk.yellow("/kick <username> - Kick a user (Admin+ only)"));
  console.log(chalk.yellow("/list - Display online users"));
  console.log(chalk.yellow("/whisper <username> <message> - Send a private message"));
  console.log(chalk.yellow("/promote <username> <role> - Promote a user to a specified role (Co-Owner+ only)"));
  console.log(chalk.green("Available Roles:"));
  console.log(chalk.yellow(roles.join(', ')));
  chat();
}
function handleLogout() {
  isLoggedIn = false;
  id = "";
  console.clear();
  console.log(chalk.green("Logout successful!\n"));
  socket.emit("message", `🖥️  : ${chalk.blue(getUserRole(id))} ${chalk.green(id)} has left the chat`);
  rl.question("Would you like to signup or login? (signup/login) ", (ans) => {
    if (ans.toLowerCase() === "signup") {
      signup();
    }
    if (ans.toLowerCase() === "login") {
      login();
    }
  });
}
function handleClear() {
  console.clear();
  console.log(`${chalk.red('Chat Cleared')}`);
  chat();
}
function getUserRole(username) {
  const user = validUsers.find(user => user.username === username);
  return user ? `[${user.role}]` : '';
}

function login() {
  console.log(chalk.yellow("Please Login"));
  rl.question("Enter your username: ", (username) => {
    rl.question("Enter your password: ", (password) => {
      const userIndex = validUsers.findIndex(user => user.username === username);

      if (userIndex !== -1 && validUsers[userIndex].password === password) {
        id = username;
        isLoggedIn = true;
        console.clear();
        console.log(chalk.green("Login successful!\n"));
        socket.emit("message", `🖥️  : ${chalk.blue(getUserRole(id))} ${chalk.green(id)} has joined the chat`);
        chat();
        onlineUsers.add(id);
      } else {
        console.clear();
        console.log(chalk.red("Invalid username or password."));
        rl.question("Do you want to create a new account? (yes/no) ", (response) => {
          if (response.toLowerCase() === 'yes') {
            signup();
          } else {
            login();
          }
        });
      }
    });
  });
}
function signup() {
  rl.question("Enter your new username: ", (newUsername) => {
    rl.question("Enter your new password: ", (newPassword) => {
      const userIndex = validUsers.findIndex(user => user.username === newUsername);

      if (userIndex === -1) {
        const role = "User"; // Set the role to "User"
        const newUser = { username: newUsername, password: newPassword, role };
        validUsers.push(newUser);

        saveUserData(validUsers, (err) => {
          if (err) {
            console.error(chalk.red('Error writing to user data file:', err));
            // If there's an error, you may want to handle it accordingly.
          } else {
            id = newUsername;
            isLoggedIn = true;
            console.clear();
            console.log(chalk.green("Account created successfully!\n"));
            socket.emit("message", `🖥️  : ${chalk.blue(getUserRole(id))} ${chalk.green(id)} has joined the chat`);
            chat();
            onlineUsers.add(id);
          }
        });
      } else {
        console.log(chalk.red("Username already exists. Please choose a different username."));
        signup();
      }
    });
  });
}

function saveUserData(users, callback) {
  const data = JSON.stringify(users, null, 2);
  fs.writeFile(userDataFile, data, (err) => {
    if (err) {
      callback(err);
    } else {
      callback(null);
    }
  });
}
function loadUserData() {
  try {
    const data = fs.readFileSync(userDataFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log(chalk.yellow("User data file not found or is invalid. Starting with an empty user list."));
    return [];
  }
}

function connectToServer() {
  rl.question("Would you like to signup or login? (signup/login) ", (ans) => {
    if(ans.toLowerCase() === "signup") {
      signup();
    }
    if(ans.toLowerCase() === "login") {
      login();
    }
    else {
      console.clear();
      console.log(chalk.red("Invalid input. Please enter 'signup' or 'login'."));
      connectToServer();
    }
  });
}

socket.on('connect', () => {
  connectToServer();

  socket.on('msg', function (data) {
    if (buffer != data) {
      console.log("\n" + data);
      chat();
    }
  });
});

socket.on('disconnect', () => {
  onlineUsers.delete(id);
});

socket.on('connect_error', (error) => {
  console.error(chalk.red("Error connecting to the server: "), error);
});
