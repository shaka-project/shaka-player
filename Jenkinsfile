@Library('tivoPipeline') _

def aws_docker_registry = '846866821192.dkr.ecr.us-west-1.amazonaws.com/build'
def aws = 'AWS_DEFAULT_REGION=us-west-1 docker run --rm -eAWS_DEFAULT_REGION -eAWS_ACCESS_KEY_ID -eAWS_SECRET_ACCESS_KEY dostar/alpine-awscli:3.8-1.16.125 aws'

ecr_publish_credentials_env = [
    string(credentialsId: 'swp-build-aws-access-key-id',     variable: 'AWS_ACCESS_KEY_ID'),
    string(credentialsId: 'swp-build-aws-secret-access-key', variable: 'AWS_SECRET_ACCESS_KEY')
];

deployment_credentials_env = [
    file  (credentialsId: 'swp-build-rpmsrv-deployment-key', variable: 'APP_DEPLOY_KEY')
];

pipeline {
    agent any
    options {
        skipDefaultCheckout true
    }
    stages {
        stage('Checkout') {
            steps {
                slackSend( channel: "#http-rpmcache-admin", sendAsText: true,
                    message: ":arrow_forward: `${env.JOB_NAME}` <${env.BUILD_URL}/console|#${env.BUILD_NUMBER}>")

                script {
                    vars = checkout scm
                    branch = vars.GIT_BRANCH
                    commit = vars.GIT_COMMIT
                    build_timestamp_docker = env.BUILD_TIMESTAMP_DOCKER
                    commit_short = vars.GIT_COMMIT.substring(0,7)
                    project = env.JOB_NAME.split('/')[0];
                    tag = "${project}:${branch}-${build_timestamp_docker}-${commit_short}"
                    tag_full = "${aws_docker_registry}/${tag}"

                    echo "Building PROJECT=${project} BRANCH=${branch} GIT_COMMIT=${commit} TAG=${tag}"

                    deployment_config_env = [
                        configFile(fileId: "${project}_${branch}_ansible.inventory", variable: 'APP_ANSIBLE_INVENTORY'),
                        configFile(fileId: 'credentials.properties', variable: 'CREDENTIAL_PROPERTIES_FILE')
                    ];

                    build_env = [
                        "APP_NAME=${project}",
                        "APP_IMAGE=${tag_full}"
                    ];
                }
                sh "env | sort"
            }
        }

        stage('AWS Auth') {
            steps {
                withCredentials(ecr_publish_credentials_env) {
                    sh "echo ${aws} ecr get-login --no-include-email | bash"
                }
            }
        }

        stage('Build') {
            steps {
                sh 'docker --version'
                sh 'git --version'
                sh 'git fetch --tags'
                sh 'whoami; id -u; id -g; ls -l'
                sh 'docker build . -t shaka-builder-a24bb4cd'
                sh 'docker run --rm -v"${PWD}":"${PWD}" -w="${PWD}" -u="$(id -u):$(id -g)" shaka-builder-a24bb4cd ls -l'
                sh 'docker run --rm -v"${PWD}":"${PWD}" -w="${PWD}" -u="$(id -u):$(id -g)" shaka-builder-a24bb4cd ./build/all.py --force'
            }
        }

        stage('Publish') {
            steps {
                sh "echo 'publish'"
            }
        }
    }

    post {
        always {
            slackSend( channel: "#http-rpmcache-admin", sendAsText: true,
                message: "${currentBuild.result == 'SUCCESS' ? ':ok:' : ':x:'} `${env.JOB_NAME}` <${env.BUILD_URL}/console|#${env.BUILD_NUMBER}> ${currentBuild.result}")
        }
    }
}