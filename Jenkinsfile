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

        stage('Build') {
            steps {
                sh 'HOME=${HOME}'
                sh 'docker build --no-cache -t shaka-builder-a24bb4cd - < Dockerfile'
                sh 'docker run --rm -v "${PWD}":"${PWD}" -w="${PWD}" -u="$(id -u):$(id -g)" -eHOME=${PWD} shaka-builder-a24bb4cd ls -ll --force'
            }
        }

        stage('Publish') {
            steps {
                sh '''
wget -O hub.tgz  --progress=dot:mega https://github.com/github/hub/releases/download/v2.14.2/hub-linux-amd64-2.14.2.tgz
rm -rf hub || true; mkdir hub
tar -xvf hub.tgz -C hub --strip-components 1
TS=$(date +%s)

tar -cvzf dist.tgz dist/

export GITHUB_TOKEN=$(p4 print -q //d-alviso/swproduction/mainline/scripts/github-get | grep 'export GITHUB_AUTOMATION_TOKEN=' | cut -f2 -d=)

./hub/bin/hub release create -m "Inception ${TS}" -a dist.tgz v3.0.1-alpha.tivo.${TS}
'''
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
