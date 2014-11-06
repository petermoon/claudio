// args
// 2: Name to use for creating music bucket, web bucket, assume_role_user, role
// 3: Region to use for bucket
// 4: Facebook app id

var name = process.argv[2];
var region = process.argv[3];
var fbAppId = process.argv[4];

if (!name || !region) {
    console.log('You need to provide a user name and a valid AWS region to run setup.js');
    process.exit(1);
}

var AWS = require('aws-sdk');
var readline = require('readline');
var events = require('events');

AWS.config.region = region;

var s3 = new AWS.S3();
var iam = new AWS.IAM();

console.log('Checking if the name you chose is available...');

var musicBucket = {
        bucketName: name + '-claudio-music-test',
        exists: false
    },
    webpageBucket = {
        bucketName: name + '-claudio-web-test',
        exists: false
    },
    role = {
        roleName: name + '-claudio-role-test',
        exists: false
    }

var resourcesToCheck = [{
    client: s3,
    action: 'headBucket',
    params: {
        Bucket: musicBucket.bucketName
    },
    description: 'S3 Bucket for music',
    name: musicBucket.bucketName
}, {
    client: s3,
    action: 'headBucket',
    params: {
        Bucket: webpageBucket.bucketName
    },
    description: 'S3 Bucket for webpage',
    name: webpageBucket.bucketName
}, {
    client: iam,
    action: 'getRole',
    params: {
        RoleName: role.roleName
    },
    description: 'IAM web identity federation role for music bucket access',
    name: role.roleName
}];

checkResourceExists(resourcesToCheck[0],
    checkResourceExists(resourcesToCheck[1],
        checkResourceExists(resourcesToCheck[2],
            makeMusicBucket(
                makeWebBucket(
                    makeWifRole(null))))))();


function checkResourceExists(resource, callback) {
    return function() {
        console.log(resource.action, resource.params);
        resource.client[resource.action](resource.params, function(err, data) {
            if (err) {
                if (err.statusCode === 404) {
                    console.log(resource.description + ': "' + resource.name + '" doesn\'t exist');
                    if (typeof callback === 'function') {
                        callback();
                    }
                } else {
                    console.log('ERROR: ', err);
                    process.exit(1);
                }
            } else {
                console.log('You already own "' + resource.name + '" (' + resource.description + ').');

                var rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                rl.question('Do you want to use it (keep using it) for claudio? (y/n): ', function(answer) {
                    if (answer === 'y') {
                        callback();
                        rl.close();
                    } else {
                        console.log('Choose another name.', 'Exiting...')
                        rl.close();
                        process.exit(1);
                    }
                });
            }
        });
    }
}

function makeMusicBucket(callback) {
    return function() {
        var params = {
            Bucket: musicBucket.bucketName
        };
        s3.createBucket(params, function(err, data) {
            if (err) {
                console.log(err);
                process.exit(1);
            } else {
                s3.waitFor('bucketExists', params, function() {
                    console.log('Music bucket (' + musicBucket.bucketName + ') created.');
                    var cors = {
                        Bucket: musicBucket.bucketName,
                        /* required */
                        CORSConfiguration: {
                            CORSRules: [{
                                AllowedHeaders: [
                                    '*'
                                ],
                                AllowedMethods: [
                                    'GET', 'PUT'
                                ],
                                AllowedOrigins: [
                                    '*'
                                ],
                                MaxAgeSeconds: 3000
                            }]
                        }
                    };
                    s3.putBucketCors(cors, function(err, data) {
                        if (err) {
                            console.log(err, err.stack);
                        } else {
                            console.log('CORS configured on music bucket (' + musicBucket.bucketName + ').');
                            if (typeof callback === 'function') {
                                callback();
                            }
                        }
                    });
                });
            }
        });
    }
}

function makeWebBucket(callback) {
    return function() {
        var params = {
            Bucket: webpageBucket.bucketName
        };
        s3.createBucket(params, function(err, data) {
            s3.waitFor('bucketExists', params, function() {
                console.log('Web-hosting bucket (' + webpageBucket.bucketName + ') created.');
                if (typeof callback === 'function') {
                    callback();
                }
            });
        });
    }
}

function makeWifRole(callback) {
    return function() {
        var params = {
            AssumeRolePolicyDocument: '{\
			  "Version": "2012-10-17",\
			  "Statement": [\
			    {\
			      "Sid": "",\
			      "Effect": "Allow",\
			      "Principal": {\
			        "Federated": "graph.facebook.com"\
			      },\
			      "Action": "sts:AssumeRoleWithWebIdentity",\
			      "Condition": {\
			        "StringEquals": {\
			          "graph.facebook.com:app_id": "' + fbAppId + '"\
			        }\
			      }\
			    }\
			  ]\
			}',
            RoleName: role.roleName
        };
        iam.createRole(params, function(err, data) {
            if (err) {
                console.log(err, err.stack);
            } else {
                console.log('IAM role (' + role.roleName + ') was created.');
                var policy = {
                    PolicyDocument: '{\
					  "Version": "2012-10-17",\
					  "Statement": [\
					    {\
					      "Effect": "Allow",\
					      "Action": [\
					        "s3:ListBucket"\
					      ],\
					      "Resource": "arn:aws:s3:::' + musicBucket.bucketName + '"\
					    },\
					    {\
					      "Effect": "Allow",\
					      "Action": [\
					        "s3:GetObject"\
					      ],\
					      "Resource": "arn:aws:s3:::' + musicBucket.bucketName + '/*"\
					    },\
					    {\
					      "Effect": "Allow",\
					      "Action": [\
					        "s3:PutObject"\
					      ],\
					      "Resource": "arn:aws:s3:::' + musicBucket.bucketName + '/__player_state__"\
					    }\
					  ]\
					}',
                    PolicyName: 'claudio-music',
                    RoleName: role.roleName
                };
                iam.putRolePolicy(policy, function(err, data) {
                    if (err) {
                        console.log(err, err.stack);
                    } else {
                        console.log('Access policy has been configured for IAM role (' + role.roleName + ').');
                        console.log(data);
                        if (typeof callback === 'function') {
                            callback();
                        }
                    }
                });
            }
        });
    }
}