// Configure authentication
const authUser = 'user';
const authPass = 'pass';

// Construct the Basic Auth string
const authString = 'Basic ' + new Buffer(authUser + ':' + authPass).toString('base64');


function handler(event) {
    var authHeaders = event.request.headers.authorization;
  
    // The Base64-encoded Auth string that should be present.
    // It is an encoding of `Basic base64([username]:[password])`
    // The username and password are:
    //      Username: john
    //      Password: foobar
    var expected = "Basic am9objpmb29iYXI=";
  
    // If an Authorization header is supplied and it's an exact match, pass the
    // request on through to CF/the origin without any modification.
    if (authHeaders && authHeaders.value === expected) {
      return event.request;
    }
  
    // But if we get here, we must either be missing the auth header or the
    // credentials failed to match what we expected.
    // Request the browser present the Basic Auth dialog.
    var response = {
      statusCode: 401,
      statusDescription: "Unauthorized",
      headers: {
        "www-authenticate": {
          value: 'Basic realm="Enter credentials for this super secure site"',
        },
      },
    };
  
    return response;
  }
  