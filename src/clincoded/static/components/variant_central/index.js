'use strict';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import createReactClass from 'create-react-class';
import _ from 'underscore';
import { RestMixin } from '../rest';
import { VariantCurationHeader } from './header';
import { VariantCurationActions } from './actions';
import { VariantCurationInterpretation } from './interpretation';
import { parseClinvar } from '../../libs/parse-resources';
import { getHgvsNotation } from './helpers/hgvs_notation';
import { setPrimaryTranscript } from './helpers/primary_transcript';
import { getClinvarInterpretations, parseClinvarSCVs } from './helpers/clinvar_interpretations';
import { CurationInterpretationCriteria } from './interpretation/criteria';
import { EvaluationSummary } from './interpretation/summary';
import { curator_page, queryKeyValue, dbxref_prefix_map, external_url_map } from '../globals';

var SO_terms = require('./interpretation/mapping/SO_term.json');
var genomic_chr_mapping = require('./interpretation/mapping/NC_genomic_chr_format.json');

// Variant Curation Hub
var VariantCurationHub = createReactClass({
    mixins: [RestMixin],

    propTypes: {
        href: PropTypes.string,
        href_url: PropTypes.object,
        session: PropTypes.object,
        affiliation: PropTypes.object
    },

    getInitialState: function() {
        return {
            variantUuid: queryKeyValue('variant', this.props.href),
            interpretationUuid: queryKeyValue('interpretation', this.props.href),
            interpretation: null,
            editKey: queryKeyValue('edit', this.props.href),
            summaryKey: queryKeyValue('summary', this.props.href),
            summaryVisible: false,
            selectedTab: queryKeyValue('tab', this.props.href),
            selectedSubtab: queryKeyValue('subtab', this.props.href),
            selectedCriteria: queryKeyValue('criteria', this.props.href),
            variantObj: null,
            ext_pageData: null,
            ext_myVariantInfo: null,
            ext_ensemblVariation: null,
            ext_ensemblHgvsVEP: null,
            ext_clinvarEutils: null,
            ext_clinVarEsearch: null,
            ext_clinVarSCV: null,
            ext_clinvarInterpretationSummary: null,
            ext_myGeneInfo_MyVariant: null,
            ext_myGeneInfo_VEP: null,
            ext_myGeneInfo_ClinVar: null,
            ext_ensemblGeneId: null,
            ext_geneSynonyms: null,
            ext_singleNucleotide: true,
            loading_clinvarEutils: true,
            loading_clinvarEsearch: true,
            loading_clinvarSCV: true,
            loading_ensemblHgvsVEP: true,
            loading_ensemblVariation: true,
            loading_pageData: true,
            loading_myVariantInfo: true,
            loading_myGeneInfo: true,
            calculated_pathogenicity: null,
            autoClassification: null,
            provisionalPathogenicity: null,
            provisionalReason: null,
            evidenceSummary: null,
            classification: {},
            classificationStatus: 'In progress',
            classificationSnapshots: [],
        };
    },

    componentDidMount: function() {
        this.getClinVarData(this.state.variantUuid);
        if (this.state.interpretationUuid) {
            this.getRestData('/interpretations/' + this.state.interpretationUuid).then(interpretation => {
                this.setState({interpretation: interpretation}, () => {
                    // Return provisional-variant object properties
                    if (this.state.interpretation.provisional_variant && this.state.interpretation.provisional_variant.length) {
                        const classification = this.state.interpretation.provisional_variant[0];
                        this.setState({
                            autoClassification: classification.autoClassification,
                            provisionalPathogenicity: classification.alteredClassification,
                            provisionalReason: interpretation.provisional_variant[0].reason,
                            evidenceSummary: classification.evidenceSummary ? classification.evidenceSummary : null,
                            classificationStatus: classification.classificationStatus
                        }, () => this.getClassificationSnaphots(classification.uuid));
                    }
                });
            });
        }
        if (this.state.summaryKey) {
            this.setState({summaryVisible: true});
        }
    },

    /**
     * Method to retrieve the updated classification object and pass the updated state as a prop
     * back to the child components (e.g. provisional, approval).
     * Called as PropTypes.func in the child components upon the PUT request to update the classification.
     * @param {string} provisionalId - The '@id' of the (provisional) classification object
     */
    updateProvisionalObj(provisionalId) {
        this.getRestData(provisionalId).then(result => {
            // Get an updated copy of the classification object
            this.setState({classification: result, classificationStatus: result.classificationStatus});
            return Promise.resolve(result);
        }).then(data => {
            // Get an updated copy of the interpretation object
            this.updateInterpretationObj();
        });
    },

    /**
     * Method to retrieve the given snapshot object and concat with the existing snapshot list.
     * Then pass the updated state as a prop back to the child components (e.g. provisional, approval).
     * Called as PropTypes.func in the child components upon saving a new snapshot.
     * @param {string} snapshotId - The '@id' of the newly saved snapshot object
     */
    updateSnapshotList(snapshotId) {
        let classificationSnapshots = this.state.classificationSnapshots;
        this.getRestData(snapshotId).then(result => {
            const newClassificationSnapshots = [result, ...classificationSnapshots];
            this.setState({classificationSnapshots: newClassificationSnapshots});
        });
    },

    /**
     * Method to get a list of snapshots of a classification, either provisioned or approved,
     * given the matching UUID of the classificaiton object.
     * Called only once in the componentDidMount() lifecycle method via the loadData() method.
     * @param {string} provisionalUuid - UUID of the saved classification object in a snapshot
     */
    getClassificationSnaphots(provisionalUuid) {
        this.getRestData('/search/?type=snapshot&resourceId=' + provisionalUuid, null, true).then(result => {
            this.setState({classificationSnapshots: result['@graph']});
        }).catch(err => {
            console.log('Classification Snapshots Fetch Error=: %o', err);
        });
    },

    // Retrieve the variant object from db with the given uuid
    getClinVarData: function(uuid) {
        return this.getRestData('/variants/' + uuid, null, true).then(response => {
            // The variant object successfully retrieved
            this.setState({variantObj: response});
            // ping out external resources (all async)
            this.fetchClinVarEutils(this.state.variantObj);
            this.fetchMyVariantInfo(this.state.variantObj);
            this.fetchEnsemblVariation(this.state.variantObj);
            this.fetchEnsemblHGVSVEP(this.state.variantObj);
            this.parseVariantType(this.state.variantObj);
            const session = this.props.session;
            if (session && session.user_properties && session.user_properties.email !== 'clingen.demo.curator@genome.stanford.edu') {
                this.fetchPageData(this.state.variantObj);
            }
        }).catch(function(e) {
            console.log('FETCH CLINVAR ERROR=: %o', e);
        });
    },

    // Retrieve ClinVar data from Eutils
    fetchClinVarEutils: function(variant) {
        if (variant) {
            if (variant.clinvarVariantId) {
                this.setState({clinvar_id: variant.clinvarVariantId});
                // Get ClinVar data via the parseClinvar method defined in parse-resources.js
                this.getRestDataXml(external_url_map['ClinVarEutils'] + variant.clinvarVariantId).then(xml => {
                    // Passing 'true' option to invoke 'mixin' function
                    // To extract more ClinVar data for 'Basic Information' tab
                    var variantData = parseClinvar(xml, true);
                    // Won't show population/predictor data if variation type is 'Haplotype'
                    if (variantData.clinvarVariationType && variantData.clinvarVariationType === 'Haplotype') {
                        this.setState({ext_singleNucleotide: false});
                    }
                    this.setState({
                        ext_clinvarEutils: variantData,
                        ext_clinvarInterpretationSummary: getClinvarInterpretations(xml),
                        ext_clinVarSCV: parseClinvarSCVs(xml),
                        loading_clinvarEutils: false,
                        loading_clinvarSCV: false
                    });
                    // Last alternative to get gene id and symbol from ClinVar
                    // for API call to mygene.info to retreive gene related data
                    if (variantData.gene && variantData.gene.id) {
                        let clinvar_gene_id = variantData.gene.id;
                        let clinvar_gene_symbol = variantData.gene.symbol;
                        this.fetchMyGeneInfo(clinvar_gene_symbol, clinvar_gene_id, 'ClinVar');
                    } else {
                        // If all else fails, quit trying...
                        this.setState({loading_myGeneInfo: false});
                    }
                    this.handleCodonEsearch(variantData);
                }).catch(err => {
                    this.setState({
                        loading_clinvarEutils: false,
                        loading_clinvarSCV: false,
                        loading_clinvarEsearch: false
                    });
                    console.log('ClinVarEutils Fetch Error=: %o', err);
                });
            } else {
                this.setState({
                    loading_clinvarEutils: false,
                    loading_clinvarSCV: false,
                    loading_clinvarEsearch: false
                });
            }
        }
    },

    /**
     * Retrieve data from MyVariantInfo
     * REVEL data is no longer queried from Bustamante lab
     * Since REVEL data is now available in the myvariant.info response
     * So we can access its data object via response['dbnsfp']['revel']
     * @param {object} variant - The variant data object
     */
    fetchMyVariantInfo(variant) {
        if (variant) {
            let hgvs_notation = getHgvsNotation(variant, 'GRCh37');
            if (hgvs_notation) {
                this.getRestData(this.props.href_url.protocol + external_url_map['MyVariantInfo'] + hgvs_notation).then(response => {
                    this.setState({ext_myVariantInfo: response, loading_myVariantInfo: false});
                    this.parseMyVariantInfo(response);
                }).catch(err => {
                    this.setState({
                        loading_myVariantInfo: false
                    });
                    console.log('MyVariant Fetch Error=: %o', err);
                });
            } else {
                this.setState({
                    loading_myVariantInfo: false
                });
            }
        }
    },

    // Retrieve data from Ensembl Variation
    fetchEnsemblVariation: function(variant) {
        if (variant) {
            // Extract only the number portion of the dbSNP id
            var numberPattern = /\d+/g;
            var rsid = (variant.dbSNPIds && variant.dbSNPIds.length > 0) ? variant.dbSNPIds[0].match(numberPattern) : null;
            if (rsid) {
                this.getRestData(this.props.href_url.protocol + external_url_map['EnsemblVariation'] + 'rs' + rsid + '?content-type=application/json;pops=1;population_genotypes=1').then(response => {
                    this.setState({ext_ensemblVariation: response, loading_ensemblVariation: false});
                    //this.parseTGenomesData(response);
                    //this.calculateHighestMAF();
                }).catch(err => {
                    this.setState({loading_ensemblVariation: false});
                    console.log('Ensembl Fetch Error=: %o', err);
                });
            } else {
                this.setState({loading_ensemblVariation: false});
            }
        }
    },

    // Retrieve data from Ensembl HGVS VEP
    fetchEnsemblHGVSVEP: function(variant) {
        if (variant) {
            let hgvs_notation = getHgvsNotation(variant, 'GRCh38', true);
            let request_params = '?content-type=application/json&hgvs=1&protein=1&xref_refseq=1&ExAC=1&MaxEntScan=1&GeneSplicer=1&Conservation=1&numbers=1&domains=1&canonical=1&merged=1';
            if (hgvs_notation) {
                this.getRestData(this.props.href_url.protocol + external_url_map['EnsemblHgvsVEP'] + hgvs_notation + request_params).then(response => {
                    this.setState({ext_ensemblHgvsVEP: response, loading_ensemblHgvsVEP: false});
                    this.parseEnsemblGeneId(response);
                    this.parseEnsemblHgvsVEP(response);
                }).catch(err => {
                    this.setState({loading_ensemblHgvsVEP: false});
                    console.log('Ensembl Fetch Error=: %o', err);
                });
            } else {
                this.setState({loading_ensemblHgvsVEP: false});
            }
        }
    },

    // Method to parse variant type
    // Won't show population/predictor data if subject is not single nucleotide variant
    parseVariantType: function(variant) {
        if (variant) {
            // Reference to http://www.hgvs.org/mutnomen/recs-DNA.html
            let seqChangeTypes = ['del', 'dup', 'ins', 'indels', 'inv', 'con'];
            let genomicHGVS, ncGenomic;

            if (variant.hgvsNames && variant.hgvsNames.GRCh37) {
                genomicHGVS = variant.hgvsNames.GRCh37;
            } else if (variant.hgvsNames && variant.hgvsNames.GRCh38) {
                genomicHGVS = variant.hgvsNames.GRCh38;
            }
            // Filter variant by its change type
            // Look for the <VariantType> node value in first pass
            // Then look into HGVS term for non-SNV type patterns
            if (variant.variationType && variant.variationType !== 'single nucleotide variant') {
                this.setState({ext_singleNucleotide: false});
            } else if (genomicHGVS) {
                ncGenomic = genomicHGVS.substring(genomicHGVS.indexOf(':'));
                seqChangeTypes.forEach(type => {
                    if (ncGenomic.indexOf(type) > 0) {
                        this.setState({ext_singleNucleotide: false});
                    }
                });
            }
        }
    },

    // Method to parse Entrez gene symbol and id from myvariant.info
    // Primary option to get gene id and symbol for making
    // API call to mygene.info to retreive gene related data
    parseMyVariantInfo: function(myVariantInfo) {
        let geneSymbol, geneId;
        if (myVariantInfo) {
            if (myVariantInfo.clinvar && myVariantInfo.clinvar.gene) {
                geneSymbol = myVariantInfo.clinvar.gene.symbol;
                geneId = myVariantInfo.clinvar.gene.id;
            } else if (myVariantInfo.dbsnp && myVariantInfo.dbsnp.gene) {
                geneSymbol = myVariantInfo.dbsnp.gene.symbol;
                geneId = myVariantInfo.dbsnp.gene.geneid;
            } else if (myVariantInfo.cadd) {
                if (myVariantInfo.cadd.gene && !Array.isArray(myVariantInfo.cadd.gene)) {
                    geneSymbol = myVariantInfo.cadd.gene.genename;
                    geneId = myVariantInfo.cadd.gene.gene_id;
                } else if (myVariantInfo.cadd.gene && Array.isArray(myVariantInfo.cadd.gene)) {
                    let found = myVariantInfo.cadd.gene.filter(item => item.gene_id && item.genename);
                    if (found && found.length) {
                        geneSymbol = found[0].genename;
                        geneId = found[0].gene_id;
                    }
                }
            }
            this.fetchMyGeneInfo(geneSymbol, geneId, 'myVariantInfo');
        }
    },

    // Method to parse Ensembl gene_id from VEP
    parseEnsemblGeneId: function(ensemblHgvsVEP) {
        let transcripts = ensemblHgvsVEP[0].transcript_consequences;
        if (transcripts) {
            transcripts.forEach(transcript => {
                // Filter Ensembl transcripts by 'source' and 'canonical' flags
                if (transcript.source === 'Ensembl' && transcript.hgvsc) {
                    if (transcript.canonical && transcript.canonical === 1) {
                        this.setState({ext_ensemblGeneId: transcript.gene_id});
                    }
                }
            });
        }
    },

    // Method to parse Entrez gene symbol and id from VEP
    // Secondary option to get gene id and symbol for making
    // API call to mygene.info to retreive gene related data
    parseEnsemblHgvsVEP: function(ensemblHgvsVEP) {
        let geneSymbol, geneId;
        if (ensemblHgvsVEP) {
            let primaryTranscript = setPrimaryTranscript(ensemblHgvsVEP);
            if (primaryTranscript) {
                geneSymbol = primaryTranscript.gene_symbol;
                geneId = primaryTranscript.gene_id;
            }
            this.fetchMyGeneInfo(geneSymbol, geneId, 'ensemblHgvsVEP');
        }
    },

    // Method to fetch Gene-centric data from mygene.info
    // and pass the data object to child component
    fetchMyGeneInfo: function(geneSymbol, geneId, source) {
        if (geneSymbol) {
            this.getRestData(this.props.href_url.protocol + external_url_map['HGNCFetch'] + geneSymbol).then(result => {
                const synonyms = result.response.docs.length && result.response.docs[0].alias_symbol ? result.response.docs[0].alias_symbol : null;
                this.setState({ext_geneSynonyms: synonyms});
            }).catch(err => {
                console.log('Local Gene Symbol Fetch ERROR=: %o', err);
            });
        }
        if (geneId) {
            let fields = 'fields=entrezgene,exac,HGNC,MIM,homologene.id,interpro,name,pathway.kegg,pathway.netpath,pathway.pid,pdb,pfam,pharmgkb,prosite,uniprot.Swiss-Prot,summary,symbol';
            this.getRestData(this.props.href_url.protocol + external_url_map['MyGeneInfo'] + geneId + '&species=human&' + fields).then(result => {
                let geneObj = result.hits[0];
                if (source === 'myVariantInfo') {
                    this.setState({ext_myGeneInfo_MyVariant: geneObj});
                } else if (source === 'ensemblHgvsVEP') {
                    this.setState({ext_myGeneInfo_VEP: geneObj});
                } else if (source === 'ClinVar') {
                    this.setState({ext_myGeneInfo_ClinVar: geneObj});
                }
                this.setState({loading_myGeneInfo: false});
            }).catch(err => {
                this.setState({loading_myGeneInfo: false});
                console.log('MyGeneInfo Fetch Error=: %o', err);
            });
        } else {
            this.setState({loading_myGeneInfo: false});
        }
    },

    /**
     * Retrieve data from PAGE data
     * @param {object} variant - The variant data object
     */
    fetchPageData(variant) {
        const hostname = this.props.href_url && this.props.href_url.hostname;
        if (variant && (hostname && hostname !== 'localhost')) {
            let hgvs_notation = getHgvsNotation(variant, 'GRCh37', true);
            let hgvsParts = hgvs_notation.split(':');
            let position = hgvsParts[1].replace(/[^\d]/g, '');
            let pageDataVariantId = hgvsParts[0] + ':' + position;
            if (pageDataVariantId) {
                this.getRestData(external_url_map['PAGE'] + pageDataVariantId).then(response => {
                    this.setState({ext_pageData: response, loading_pageData: false});
                }).catch(err => {
                    this.setState({loading_pageData: false});
                    console.log('Page Data Fetch Error=: %o', err);
                });
            } else {
                this.setState({loading_pageData: false});
            }
        }
    },

    // Retrieve codon data from ClinVar Esearch given Eutils/ClinVar response
    handleCodonEsearch: function(response) {
        let aminoAcidLocation = response.allele.ProteinChange;
        let symbol = response.gene.symbol;
        if (aminoAcidLocation && symbol) {
            let term = aminoAcidLocation.substr(0, aminoAcidLocation.length-1);
            this.getRestData(external_url_map['ClinVarEsearch'] + 'db=clinvar&term=' + term + '+%5Bvariant+name%5D+and+' + symbol + '&retmode=json').then(result => {
                // pass in these additional values, in case receiving component needs them
                result.vci_term = term;
                result.vci_symbol = symbol;
                this.setState({ext_clinVarEsearch: result, loading_clinvarEsearch: false});
            }).catch(err => {
                this.setState({loading_clinvarEsearch: false});
                console.log('ClinVarEsearch Fetch Error=: %o', err);
            });
        } else {
            this.setState({loading_clinvarEsearch: false});
        }
    },

    // method to update the interpretation object and send it down to child components on demand
    updateInterpretationObj: function() {
        this.getRestData('/variants/' + this.state.variantUuid).then(variant => {
            this.setState({variantObj: variant});
            return Promise.resolve(variant);
        }).then(result => {
            this.getRestData('/interpretation/' + this.state.interpretationUuid).then(interpretation => {
                this.setState({interpretation: interpretation});
            });
        });
    },

    // Method to update status of summary page visibility
    setSummaryVisibility: function(visible) {
        this.setState({summaryVisible: visible});
    },

    // Method to update the selected tab state to be used by criteria bar
    getSelectedTab: function(selectedTab) {
        this.setState({selectedTab: selectedTab});
    },

    // Method to update the selected subtab state
    getSelectedSubTab(selectedSubtab) {
        this.setState({selectedSubtab: selectedSubtab});
    },

    // Method to update the selected subtab state and update the url
    updateSelectedCriteria(selectedTab, selectedSubtab, selectedCriteria) {
        this.setState({
            selectedTab: selectedTab,
            selectedSubtab: selectedSubtab,
            selectedCriteria: selectedCriteria
        });
    },

    // Method to set the calculated pathogenicity state for summary page
    setCalculatedPathogenicity: function(assertion) {
        if (assertion && this.state.calculated_pathogenicity !== assertion) {
            this.setState({calculated_pathogenicity: assertion});
        }
    },

    // Method to persist provisional evaluation states
    setProvisionalEvaluation: function(field, value) {
        if (field === 'provisional-pathogenicity' && this.state.provisionalPathogenicity !== value) {
            this.setState({provisionalPathogenicity: value});
        }
        if (field === 'provisional-reason' && this.state.provisionalReason !== value) {
            this.setState({provisionalReason: value});
        }
        if (field === 'evidence-summary' && this.state.evidenceSummary !== value) {
            this.setState({evidenceSummary: value});
        }
    },

    render() {
        const variantData = this.state.variantObj;
        const editKey = this.state.editKey;
        const selectedTab = this.state.selectedTab;
        const selectedSubtab = this.state.selectedSubtab;
        const selectedCriteria = this.state.selectedCriteria;
        const affiliation = this.props.affiliation;
        let interpretation = (this.state.interpretation) ? this.state.interpretation : null;
        let interpretationUuid = (this.state.interpretationUuid) ? this.state.interpretationUuid : null;
        let session = (this.props.session && Object.keys(this.props.session).length) ? this.props.session : null;
        let calculated_pathogenicity = (this.state.calculated_pathogenicity) ? this.state.calculated_pathogenicity : (this.state.autoClassification ? this.state.autoClassification : null);
        let my_gene_info = (this.state.ext_myGeneInfo_MyVariant) ? this.state.ext_myGeneInfo_MyVariant : (this.state.ext_myGeneInfo_VEP ? this.state.ext_myGeneInfo_VEP : this.state.ext_myGeneInfo_ClinVar);

        return (
            <div>
                <VariantCurationHeader variantData={variantData} interpretationUuid={interpretationUuid} session={session}
                    interpretation={interpretation} setSummaryVisibility={this.setSummaryVisibility} summaryVisible={this.state.summaryVisible}
                    getSelectedTab={this.getSelectedTab} calculatedPathogenicity={calculated_pathogenicity} affiliation={affiliation}
                    classificationSnapshots={this.state.classificationSnapshots} />
                {!this.state.summaryVisible ?
                    <div>
                        <CurationInterpretationCriteria interpretation={interpretation} selectedTab={selectedTab}
                            updateSelectedCriteria={this.updateSelectedCriteria} />
                        <VariantCurationActions variantData={variantData} interpretation={interpretation} editKey={editKey} session={session}
                            href_url={this.props.href} updateInterpretationObj={this.updateInterpretationObj}
                            calculatedAssertion={calculated_pathogenicity} provisionalPathogenicity={this.state.provisionalPathogenicity}
                            affiliation={affiliation} />
                        <VariantCurationInterpretation variantData={variantData} interpretation={interpretation} editKey={editKey} session={session}
                            href_url={this.props.href_url} updateInterpretationObj={this.updateInterpretationObj} getSelectedTab={this.getSelectedTab}
                            getSelectedSubTab={this.getSelectedSubTab}
                            ext_myGeneInfo={my_gene_info}
                            ext_pageData={this.state.ext_pageData}
                            ext_myVariantInfo={this.state.ext_myVariantInfo}
                            ext_ensemblVariation={this.state.ext_ensemblVariation}
                            ext_ensemblHgvsVEP={this.state.ext_ensemblHgvsVEP}
                            ext_clinvarEutils={this.state.ext_clinvarEutils}
                            ext_clinVarEsearch={this.state.ext_clinVarEsearch}
                            ext_clinVarSCV={this.state.ext_clinVarSCV}
                            ext_clinvarInterpretationSummary={this.state.ext_clinvarInterpretationSummary}
                            ext_ensemblGeneId={this.state.ext_ensemblGeneId}
                            ext_geneSynonyms={this.state.ext_geneSynonyms}
                            ext_singleNucleotide={this.state.ext_singleNucleotide}
                            loading_clinvarEutils={this.state.loading_clinvarEutils}
                            loading_clinvarEsearch={this.state.loading_clinvarEsearch}
                            loading_clinvarSCV={this.state.loading_clinvarSCV}
                            loading_ensemblHgvsVEP={this.state.loading_ensemblHgvsVEP}
                            loading_ensemblVariation={this.state.loading_ensemblVariation}
                            loading_pageData={this.state.loading_pageData}
                            loading_myVariantInfo={this.state.loading_myVariantInfo}
                            loading_myGeneInfo={this.state.loading_myGeneInfo}
                            setCalculatedPathogenicity={this.setCalculatedPathogenicity}
                            selectedTab={selectedTab} selectedSubtab={selectedSubtab}
                            selectedCriteria={selectedCriteria} affiliation={affiliation} />
                    </div>
                    :
                    <EvaluationSummary interpretation={interpretation} calculatedAssertion={calculated_pathogenicity}
                        updateInterpretationObj={this.updateInterpretationObj}
                        setProvisionalEvaluation={this.setProvisionalEvaluation}
                        provisionalPathogenicity={this.state.provisionalPathogenicity}
                        provisionalReason={this.state.provisionalReason}
                        evidenceSummary={this.state.evidenceSummary}
                        session={session}
                        affiliation={affiliation}
                        classificationStatus={this.state.classificationStatus}
                        classificationSnapshots={this.state.classificationSnapshots}
                        updateSnapshotList={this.updateSnapshotList}
                        updateProvisionalObj={this.updateProvisionalObj} />
                }
            </div>
        );
    }
});

curator_page.register(VariantCurationHub, 'curator_page', 'variant-central');
