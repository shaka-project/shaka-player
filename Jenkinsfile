@Library('tivoPipeline') _

pipeline {
    agent {
        node {
            label 'docker'
        }
    }
    options {
        skipDefaultCheckout true
    }
    stages {
        stage('Checkout') {
            steps {
                slackSend( channel: "#http-rpmcache-admin", sendAsText: true,
                    message: ":arrow_forward: '${env.JOB_NAME}' <${env.BUILD_URL}/console|#${env.BUILD_NUMBER}>")
                
                script {
                    vars = checkout scm
                    branch = vars.GIT_BRANCH
                    commit = vars.GIT_COMMIT
                    build_timestamp_docker = env.BUILD_TIMESTAMP_DOCKER
                    commit_short = vars.GIT_COMMIT.substring(0,7)
                    project = env.JOB_NAME.split('/')[0];
                    tag = "${project}:${branch}-${build_timestamp_docker}-${commit_short}"

                    echo "Building PROJECT=${project} BRANCH=${branch} GIT_COMMIT=${commit} TAG=${tag}"
                }
                sh "env | sort"
            }
        }

        stage('Build') {
            steps {
                sh 'HOME=${HOME}'
                sh 'docker build -t shaka-builder-a24bb4cd - < Dockerfile'
                sh 'docker run --rm -v "${PWD}":"${PWD}" -w="${PWD}" -u="$(id -u):$(id -g)" -eHOME=${PWD} shaka-builder-a24bb4cd ./build/all.py --force'
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

./hub/bin/hub release create -m "Inception ${TS}" -a dist.tgz v3.2.0-alpha.tivo.${TS}
'''
            }
        }
    }
    
    post {
        always {
            slackSend( channel: "#http-rpmcache-admin", sendAsText: true,
                message: "${currentBuild.result == 'SUCCESS' ? ':ok:' : ':x:'} '${env.JOB_NAME}' <${env.BUILD_URL}/console|#${env.BUILD_NUMBER}> ${currentBuild.result}")
        }
    }
}
